from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from . import constants

AutomationDict = Dict[str, bool]
ChannelEntry = Dict[str, str]

ALLOWED_AUTOMATION_KEYS = {"skip_ads", "mute_ads", "skip_count_tracking", "auto_play"}
ALLOWED_SKIP_CATEGORIES = {value for _, value in constants.skip_categories}


def _normalize_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return None


def _normalize_automation(payload: Any) -> AutomationDict:
    if not isinstance(payload, dict):
        return {}
    normalized: AutomationDict = {}
    for key, raw_value in payload.items():
        if key not in ALLOWED_AUTOMATION_KEYS:
            continue
        bool_value = _normalize_bool(raw_value)
        if bool_value is None:
            continue
        normalized[key] = bool_value
    return normalized


def _normalize_skip_categories(payload: Any) -> Optional[List[str]]:
    if payload is None:
        return None
    if not isinstance(payload, (list, tuple, set)):
        raise ValueError("skip_categories must be a list")
    normalized: List[str] = []
    for raw in payload:
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        if value not in ALLOWED_SKIP_CATEGORIES:
            raise ValueError(f"Invalid skip category: {value}")
        if value not in normalized:
            normalized.append(value)
    return normalized


def _normalize_channel_entry(entry: Any) -> Optional[ChannelEntry]:
    if isinstance(entry, dict):
        channel_id = entry.get("id") or entry.get("channel_id")
        name = entry.get("name")
    elif isinstance(entry, (list, tuple)) and entry:
        channel_id = entry[0]
        name = entry[1] if len(entry) > 1 else None
    else:
        channel_id = entry
        name = None
    if channel_id is None:
        return None
    channel_id = str(channel_id).strip()
    if not channel_id:
        return None
    if name is None:
        name = channel_id
    else:
        name = str(name).strip() or channel_id
    return {"id": channel_id, "name": name}


def _normalize_channel_whitelist(payload: Any) -> Optional[List[ChannelEntry]]:
    if payload is None:
        return None
    if not isinstance(payload, (list, tuple, set)):
        raise ValueError("channel_whitelist must be a list")
    normalized: List[ChannelEntry] = []
    seen: set[str] = set()
    for raw in payload:
        entry = _normalize_channel_entry(raw)
        if not entry:
            continue
        if entry["id"] in seen:
            continue
        seen.add(entry["id"])
        normalized.append(entry)
    return normalized


def normalize_overrides(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    normalized: dict[str, Any] = {}
    automation = _normalize_automation(payload.get("automation"))
    if automation:
        normalized["automation"] = automation
    skip_categories = _normalize_skip_categories(payload.get("skip_categories"))
    if skip_categories is not None:
        normalized["skip_categories"] = skip_categories
    channel_whitelist = _normalize_channel_whitelist(payload.get("channel_whitelist"))
    if channel_whitelist is not None:
        normalized["channel_whitelist"] = channel_whitelist
    return normalized


def merge_overrides(existing: Optional[dict[str, Any]], payload: Any) -> dict[str, Any]:
    if payload is None:
        return {}
    base: dict[str, Any] = copy.deepcopy(existing or {})
    if not isinstance(payload, dict):
        return base

    if "automation" in payload:
        automation_payload = payload.get("automation")
        if automation_payload is None:
            base.pop("automation", None)
        elif isinstance(automation_payload, dict):
            existing_automation = dict(base.get("automation") or {})
            for key, raw_value in automation_payload.items():
                if key not in ALLOWED_AUTOMATION_KEYS:
                    continue
                if raw_value is None:
                    existing_automation.pop(key, None)
                    continue
                bool_value = _normalize_bool(raw_value)
                if bool_value is None:
                    continue
                existing_automation[key] = bool_value
            if existing_automation:
                base["automation"] = existing_automation
            else:
                base.pop("automation", None)

    if "skip_categories" in payload:
        skip_categories = payload.get("skip_categories")
        if skip_categories is None:
            base.pop("skip_categories", None)
        else:
            normalized = _normalize_skip_categories(skip_categories) or []
            base["skip_categories"] = normalized

    if "channel_whitelist" in payload:
        whitelist_payload = payload.get("channel_whitelist")
        if whitelist_payload is None:
            base.pop("channel_whitelist", None)
        else:
            normalized = _normalize_channel_whitelist(whitelist_payload) or []
            base["channel_whitelist"] = normalized

    return base


def sanitize_stored_overrides(raw: Any) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    else:
        parsed = raw
    try:
        return normalize_overrides(parsed)
    except ValueError:
        return {}


@dataclass(frozen=True)
class DevicePreferences:
    join_name: str
    apikey: str
    skip_categories: List[str]
    channel_whitelist: List[ChannelEntry]
    skip_count_tracking: bool
    mute_ads: bool
    skip_ads: bool
    auto_play: bool
    minimum_skip_length: int


def resolve_preferences(config, overrides: Optional[dict[str, Any]] = None) -> DevicePreferences:
    overrides = overrides or {}
    automation = overrides.get("automation") or {}
    skip_categories = overrides.get("skip_categories")
    channel_whitelist = overrides.get("channel_whitelist")

    return DevicePreferences(
        join_name=getattr(config, "join_name", "SponsorBlockTV Web"),
        apikey=getattr(config, "apikey", ""),
        skip_categories=list(skip_categories)
        if skip_categories is not None
        else list(config.skip_categories),
        channel_whitelist=(
            copy.deepcopy(channel_whitelist)
            if channel_whitelist is not None
            else copy.deepcopy(config.channel_whitelist)
        ),
        skip_count_tracking=automation.get(
            "skip_count_tracking", getattr(config, "skip_count_tracking", True)
        ),
        mute_ads=automation.get("mute_ads", getattr(config, "mute_ads", False)),
        skip_ads=automation.get("skip_ads", getattr(config, "skip_ads", False)),
        auto_play=automation.get("auto_play", getattr(config, "auto_play", True)),
        minimum_skip_length=getattr(config, "minimum_skip_length", 1),
    )
