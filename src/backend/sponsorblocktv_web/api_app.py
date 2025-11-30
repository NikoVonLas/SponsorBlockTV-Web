from __future__ import annotations

import asyncio
import copy
import json
import logging
import os
import mimetypes
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from importlib import resources
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Annotated, Any, Awaitable, Callable, Optional

import aiohttp
import jwt
from jwt import InvalidTokenError
from litestar import Litestar, Request, delete, get, patch, post, put
from litestar.exceptions import HTTPException
from litestar.middleware.base import DefineMiddleware
from litestar.openapi import OpenAPIConfig
from litestar.openapi.plugins import SwaggerRenderPlugin
from litestar.openapi.spec import Components, SecurityScheme, Server
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT
from litestar.params import Parameter
from pydantic import BaseModel, Field, field_validator

from . import api_helpers, constants, ytlounge
from .helpers import Config

logger = logging.getLogger(__name__)

try:
    PACKAGE_VERSION = version("sponsorblocktv-web")
except PackageNotFoundError:  # pragma: no cover - package metadata missing during dev
    PACKAGE_VERSION = "1.0.0"

API_PREFIX = "/api"
SCHEMA_PATH = f"{API_PREFIX}/schema"
DOCS_ENV_VAR = "SBTV_ENABLE_DOCS"
LOGIN_PATH = f"{API_PREFIX}/auth/login"
FRONTEND_DIST_ENV = "SBTV_FRONTEND_DIST"
FRONTEND_INDEX_FILE = "index.html"

AUTH_USERNAME_ENV = "SBTV_AUTH_USERNAME"
AUTH_PASSWORD_ENV = "SBTV_AUTH_PASSWORD"
JWT_SECRET_ENV = "SBTV_JWT_SECRET"
JWT_EXPIRES_ENV = "SBTV_JWT_EXPIRES_SECONDS"
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "admin"
DEFAULT_SECRET = "change-me"
DEFAULT_EXPIRES_SECONDS = 3600

EXEMPT_PATHS = {f"{API_PREFIX}/health", LOGIN_PATH, SCHEMA_PATH}

OPENAPI_CONFIG = OpenAPIConfig(
    title="SponsorBlockTV Web API",
    version=PACKAGE_VERSION,
    description="Remote configuration API for SponsorBlockTV Web clients.",
    path=SCHEMA_PATH,
    render_plugins=[SwaggerRenderPlugin()],
    enabled_endpoints=set(),
    root_schema_site=None,
    components=Components(
        security_schemes={
            "BearerAuth": SecurityScheme(type="http", scheme="bearer", bearer_format="JWT"),
        }
    ),
    security=[{"BearerAuth": []}],
    servers=[Server(url=API_PREFIX, description="Local API server")],
)

_FRONTEND_DIST: Path | None = None


def api_get(path: str, **kwargs):
    return get(f"{API_PREFIX}{path}", **kwargs)


def api_post(path: str, **kwargs):
    return post(f"{API_PREFIX}{path}", **kwargs)


def api_patch(path: str, **kwargs):
    return patch(f"{API_PREFIX}{path}", **kwargs)


def api_put(path: str, **kwargs):
    return put(f"{API_PREFIX}{path}", **kwargs)


def api_delete(path: str, **kwargs):
    return delete(f"{API_PREFIX}{path}", **kwargs)


@dataclass(frozen=True)
class AuthSettings:
    username: str
    password: str
    secret: str
    expires_seconds: int


def _docs_enabled() -> bool:
    value = os.getenv(DOCS_ENV_VAR)
    if value is None:
        return False
    return value.lower() not in {"", "0", "false", "no"}


def _resolve_frontend_dist() -> Path | None:
    global _FRONTEND_DIST
    if _FRONTEND_DIST is not None:
        return _FRONTEND_DIST

    candidates: list[Path] = []
    seen: set[Path] = set()

    def add_candidate(path_like: str | Path) -> None:
        base = Path(path_like)
        for candidate in (base, base / "dist"):
            if candidate in seen:
                continue
            candidates.append(candidate)
            seen.add(candidate)

    env_path = os.getenv(FRONTEND_DIST_ENV)
    if env_path:
        add_candidate(env_path)
    try:
        package_candidate = resources.files("sponsorblocktv_web").joinpath("frontend_dist")
        add_candidate(Path(str(package_candidate)))
    except Exception:  # pragma: no cover - optional resource
        pass
    add_candidate(Path(__file__).with_name("frontend_dist"))
    base_path = Path(__file__).resolve()
    parents = list(base_path.parents)
    for idx in (1, 2, 3, 4):
        if len(parents) > idx:
            add_candidate(parents[idx] / "frontend")

    for candidate in candidates:
        if candidate.is_dir():
            _FRONTEND_DIST = candidate
            return _FRONTEND_DIST
    _FRONTEND_DIST = None
    return None


def _get_frontend_file(path_fragment: str) -> Path | None:
    dist = _resolve_frontend_dist()
    if dist is None:
        return None
    normalized = path_fragment.strip("/")
    candidate = (dist / normalized) if normalized else dist / FRONTEND_INDEX_FILE
    try:
        resolved = candidate.resolve()
        resolved.relative_to(dist.resolve())
    except (FileNotFoundError, ValueError):
        return None
    if resolved.is_file():
        return resolved
    return None


class FrontendApp:
    def __init__(self, app: Litestar, *, dist: Path):
        self.app = app
        self.dist = dist

    def __getattr__(self, item: str) -> Any:
        return getattr(self.app, item)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path") or scope.get("raw_path", b"").decode("utf-8", "ignore")
        if not path or path.startswith(API_PREFIX):
            await self.app(scope, receive, send)
            return

        asset_path: Path | None = None
        if "." in Path(path).name:
            asset_path = _get_frontend_file(path)
        target = asset_path or _get_frontend_file("")
        if target is None:
            await self.app(scope, receive, send)
            return

        mime_type, _ = mimetypes.guess_type(str(target))
        body = target.read_bytes()
        headers = [
            (b"content-type", (mime_type or "application/octet-stream").encode("ascii")),
            (b"content-length", str(len(body)).encode("ascii")),
        ]
        await send({"type": "http.response.start", "status": 200, "headers": headers})
        await send({"type": "http.response.body", "body": body})


def _get_auth_settings() -> AuthSettings:
    username = os.getenv(AUTH_USERNAME_ENV, DEFAULT_USERNAME)
    password = os.getenv(AUTH_PASSWORD_ENV, DEFAULT_PASSWORD)
    secret = os.getenv(JWT_SECRET_ENV, DEFAULT_SECRET)
    expires_raw = os.getenv(JWT_EXPIRES_ENV, str(DEFAULT_EXPIRES_SECONDS))
    try:
        expires_seconds = int(expires_raw)
    except ValueError:
        logger.warning(
            "Invalid %s value %s, falling back to %s",
            JWT_EXPIRES_ENV,
            expires_raw,
            DEFAULT_EXPIRES_SECONDS,
        )
        expires_seconds = DEFAULT_EXPIRES_SECONDS
    if username == DEFAULT_USERNAME or password == DEFAULT_PASSWORD or secret == DEFAULT_SECRET:
        logger.warning(
            "Default authentication credentials/secret are in use. Override %s, %s, and %s for security.",
            AUTH_USERNAME_ENV,
            AUTH_PASSWORD_ENV,
            JWT_SECRET_ENV,
        )
    return AuthSettings(
        username=username,
        password=password,
        secret=secret,
        expires_seconds=expires_seconds,
    )


def _issue_token(settings: AuthSettings) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.expires_seconds)
    payload = {
        "sub": settings.username,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.secret, algorithm="HS256")
    return token, settings.expires_seconds


class JWTAuthMiddleware:
    def __init__(
        self,
        app,
        *,
        auth_settings: AuthSettings,
        exempt_paths: set[str],
        api_prefix: str,
    ):
        self.app = app
        self.auth_settings = auth_settings
        self.exempt_paths = {self._normalize_path(path) for path in exempt_paths}
        self.api_prefix = api_prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        method = scope.get("method", "GET").upper()
        path = self._normalize_path(scope.get("path", ""))
        if not path.startswith(self.api_prefix):
            return await self.app(scope, receive, send)
        if method == "OPTIONS" or path in self.exempt_paths:
            return await self.app(scope, receive, send)

        headers = {key.decode().lower(): value.decode() for key, value in scope.get("headers", [])}
        auth_header = headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return await self._unauthorized(send, "Missing bearer token")
        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return await self._unauthorized(send, "Missing bearer token")
        try:
            payload = jwt.decode(token, self.auth_settings.secret, algorithms=["HS256"])
        except InvalidTokenError:
            return await self._unauthorized(send, "Invalid or expired token")
        scope.setdefault("state", {})["user"] = payload
        return await self.app(scope, receive, send)

    @staticmethod
    def _normalize_path(path: str) -> str:
        if not path:
            return "/"
        normalized = path.rstrip("/")
        return normalized or "/"

    async def _unauthorized(self, send, message: str):
        body = json.dumps({"detail": message}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("utf-8")),
                    (b"www-authenticate", b'Bearer realm="SponsorBlockTV Web"'),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class DeviceCreateRequest(BaseModel):
    screen_id: str = Field(min_length=1)
    name: Optional[str] = None
    offset: int = Field(default=0, ge=0)

    @field_validator("screen_id")
    @classmethod
    def validate_screen_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("screen_id cannot be empty")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None


class DeviceModel(BaseModel):
    screen_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    offset: int = Field(default=0, ge=0)


class DeviceUpdateModel(BaseModel):
    screen_id: Optional[str] = Field(default=None)
    name: Optional[str] = Field(default=None)
    offset: Optional[int] = Field(default=None, ge=0)

    @field_validator("screen_id")
    @classmethod
    def validate_screen_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("screen_id cannot be empty")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("name cannot be empty")
        return value


class PairDeviceRequest(BaseModel):
    pairing_code: str = Field(min_length=1)
    name: Optional[str] = None

    @field_validator("pairing_code")
    @classmethod
    def validate_pairing_code(cls, value: str) -> str:
        cleaned = value.replace("-", "").replace(" ", "")
        if len(cleaned) != 12 or not cleaned.isdigit():
            raise ValueError("Pairing code must be 12 digits")
        return cleaned

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None


class ChannelModel(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)


class ChannelAddRequest(BaseModel):
    channel_id: str = Field(min_length=1)
    name: Optional[str] = None

    @field_validator("channel_id")
    @classmethod
    def validate_channel_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("channel_id cannot be empty")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None


class ChannelSearchResult(BaseModel):
    id: str
    name: str
    subscriber_count: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = Field(default="bearer")
    expires_in: int


class ConfigResponse(BaseModel):
    devices: list[DeviceModel]
    skip_categories: list[str]
    skip_count_tracking: bool
    mute_ads: bool
    skip_ads: bool
    minimum_skip_length: int
    auto_play: bool
    join_name: str
    apikey: str
    channel_whitelist: list[ChannelModel]
    use_proxy: bool


class ConfigUpdateRequest(BaseModel):
    skip_categories: Optional[list[str]] = None
    skip_count_tracking: Optional[bool] = None
    mute_ads: Optional[bool] = None
    skip_ads: Optional[bool] = None
    minimum_skip_length: Optional[int] = Field(default=None, ge=0)
    auto_play: Optional[bool] = None
    join_name: Optional[str] = None
    apikey: Optional[str] = None
    use_proxy: Optional[bool] = None

    @field_validator("skip_categories")
    @classmethod
    def validate_skip_categories(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return value
        available_values = {item[1] for item in constants.skip_categories}
        invalid = [category for category in value if category not in available_values]
        if invalid:
            raise ValueError(f"Invalid skip categories: {', '.join(invalid)}")
        return value

    @field_validator("join_name")
    @classmethod
    def validate_join_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("join_name cannot be empty")
        return value

    @field_validator("apikey")
    @classmethod
    def validate_apikey(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return value.strip()


def _normalize_name(name: Optional[str], fallback: str) -> str:
    if name:
        stripped = name.strip()
        if stripped:
            return stripped
    return fallback


def _serialize_device(device: dict[str, Any]) -> DeviceModel:
    screen_id = str(device.get("screen_id", "") or "")
    name = _normalize_name(device.get("name"), screen_id or "Unnamed device")
    offset = int(device.get("offset", 0) or 0)
    return DeviceModel(screen_id=screen_id, name=name, offset=offset)


def _serialize_channel(channel: dict[str, Any]) -> ChannelModel:
    channel_id = str(channel.get("id", "") or "")
    name = _normalize_name(channel.get("name"), channel_id or "Unnamed channel")
    return ChannelModel(id=channel_id, name=name)


def serialize_config(config: Config) -> ConfigResponse:
    devices = [_serialize_device(copy.deepcopy(device)) for device in config.devices]
    channels = [_serialize_channel(copy.deepcopy(channel)) for channel in config.channel_whitelist]
    return ConfigResponse(
        devices=devices,
        skip_categories=list(config.skip_categories or []),
        skip_count_tracking=bool(config.skip_count_tracking),
        mute_ads=bool(config.mute_ads),
        skip_ads=bool(config.skip_ads),
        minimum_skip_length=int(getattr(config, "minimum_skip_length", 1) or 0),
        auto_play=bool(getattr(config, "auto_play", True)),
        join_name=getattr(config, "join_name", "SponsorBlockTV Web"),
        apikey=getattr(config, "apikey", ""),
        channel_whitelist=channels,
        use_proxy=bool(getattr(config, "use_proxy", False)),
    )


class ApiState:
    def __init__(self, data_dir: str) -> None:
        self.config = Config(data_dir)
        self._lock = asyncio.Lock()
        self._session: aiohttp.ClientSession | None = None
        self._session_trust_env = self.config.use_proxy
        self._api_helper: api_helpers.ApiHelper | None = None

    async def startup(self) -> None:
        async with self._lock:
            await self._ensure_resources(rebuild_session=True, refresh_helper=True)

    async def shutdown(self) -> None:
        async with self._lock:
            if self._session and not self._session.closed:
                await self._session.close()
            self._session = None
            self._api_helper = None

    async def _ensure_resources(
        self, *, rebuild_session: bool = False, refresh_helper: bool = False
    ) -> None:
        if self._session is None or self._session.closed:
            rebuild_session = True
        if rebuild_session:
            if self._session and not self._session.closed:
                await self._session.close()
            self._session = aiohttp.ClientSession(trust_env=self.config.use_proxy)
            self._session_trust_env = self.config.use_proxy
            refresh_helper = True
        if refresh_helper or self._api_helper is None:
            assert self._session is not None
            self._api_helper = api_helpers.ApiHelper(self.config, self._session)

    async def mutate_config(
        self,
        func: Callable[[Config], Any],
        *,
        refresh_helper: bool = True,
        save: bool = True,
    ) -> Any:
        async with self._lock:
            previous_trust_env = self._session_trust_env
            result = func(self.config)
            if save:
                self.config.save()
            rebuild_session = previous_trust_env != self.config.use_proxy
            await self._ensure_resources(
                rebuild_session=rebuild_session, refresh_helper=refresh_helper
            )
            return result

    async def with_api_helper(self, func: Callable[[api_helpers.ApiHelper], Awaitable[Any]]) -> Any:
        async with self._lock:
            rebuild_session = self._session is None or self._session.closed
            await self._ensure_resources(rebuild_session=rebuild_session, refresh_helper=False)
            assert self._api_helper is not None
            return await func(self._api_helper)

    async def pair_device(self, pairing_code: str, name: Optional[str]) -> DeviceModel:
        async with self._lock:
            rebuild_session = self._session is None or self._session.closed
            await self._ensure_resources(rebuild_session=rebuild_session, refresh_helper=False)
            assert self._session is not None
            lounge_controller = ytlounge.YtLoungeApi("SponsorBlockTV Web")
            await lounge_controller.change_web_session(self._session)
            try:
                paired = await lounge_controller.pair(int(pairing_code))
            except Exception as exc:  # noqa: BLE001 - broad to match CLI behaviour
                raise ValueError("Pairing request failed") from exc
            if not paired:
                raise ValueError("Invalid pairing code")
            device_name = _normalize_name(name, lounge_controller.screen_name)
            device_data = {
                "screen_id": lounge_controller.auth.screen_id,
                "name": device_name,
                "offset": 0,
            }
            if any(d.get("screen_id") == device_data["screen_id"] for d in self.config.devices):
                raise ValueError("Device already exists")
            self.config.devices.append(device_data)
            self.config.save()
            await self._ensure_resources(refresh_helper=True)
            return _serialize_device(device_data)

    async def get_config_snapshot(self) -> ConfigResponse:
        async with self._lock:
            return serialize_config(self.config)


async def _get_state(request: Request) -> ApiState:
    api_state: ApiState = request.app.state.api_state
    return api_state


@api_get("/health", tags=["System"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@post(LOGIN_PATH, security=[], tags=["Auth"])
async def login(request: Request, data: LoginRequest) -> LoginResponse:
    auth_settings: AuthSettings = request.app.state.auth_settings
    if data.username != auth_settings.username or data.password != auth_settings.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token, expires_in = _issue_token(auth_settings)
    return LoginResponse(access_token=token, expires_in=expires_in)


@get("/", tags=["System"])
async def root_status() -> dict[str, Any]:
    frontend_available = _resolve_frontend_dist() is not None
    response = {
        "message": "SponsorBlockTV Web API",
        "frontend_available": frontend_available,
        "api_base": API_PREFIX,
        "login_url": LOGIN_PATH,
        "docs_url": SCHEMA_PATH,
    }
    if not frontend_available:
        response["hint"] = (
            "Build the React UI (pnpm build in src/frontend) or set SBTV_FRONTEND_DIST to the dist path."
        )
    return response


@api_get("", tags=["System"])
async def api_root() -> dict[str, str]:
    response = {
        "message": "SponsorBlockTV Web API",
        "documentation_enabled": _docs_enabled(),
        "schema_url": SCHEMA_PATH,
        "login_url": LOGIN_PATH,
    }
    return response


@api_get("/config", tags=["Config"])
async def get_config(request: Request) -> ConfigResponse:
    state = await _get_state(request)
    return await state.get_config_snapshot()


@api_patch("/config", tags=["Config"])
async def update_config(request: Request, data: ConfigUpdateRequest) -> ConfigResponse:
    state = await _get_state(request)

    def mutate(config: Config) -> None:
        if data.skip_categories is not None:
            config.skip_categories = data.skip_categories
        if data.skip_count_tracking is not None:
            config.skip_count_tracking = data.skip_count_tracking
        if data.mute_ads is not None:
            config.mute_ads = data.mute_ads
        if data.skip_ads is not None:
            config.skip_ads = data.skip_ads
        if data.minimum_skip_length is not None:
            config.minimum_skip_length = data.minimum_skip_length
        if data.auto_play is not None:
            config.auto_play = data.auto_play
        if data.join_name is not None:
            config.join_name = data.join_name
        if data.apikey is not None:
            config.apikey = data.apikey
        if data.use_proxy is not None:
            config.use_proxy = data.use_proxy

    await state.mutate_config(mutate, refresh_helper=True)
    return await state.get_config_snapshot()


@api_get("/skip-categories/options", tags=["Config"])
async def get_skip_category_options() -> list[dict[str, str]]:
    return [{"label": label, "value": value} for label, value in constants.skip_categories]


@api_get("/devices", tags=["Devices"])
async def list_devices(request: Request) -> list[DeviceModel]:
    state = await _get_state(request)
    snapshot = await state.get_config_snapshot()
    return snapshot.devices


@api_post("/devices", status_code=HTTP_201_CREATED, tags=["Devices"])
async def add_device(request: Request, data: DeviceCreateRequest) -> DeviceModel:
    state = await _get_state(request)

    def mutate(config: Config) -> DeviceModel:
        if any(d.get("screen_id") == data.screen_id for d in config.devices):
            raise ValueError("Device with this screen_id already exists")
        device = {
            "screen_id": data.screen_id,
            "name": _normalize_name(data.name, data.screen_id),
            "offset": int(data.offset),
        }
        config.devices.append(device)
        return _serialize_device(device)

    try:
        device = await state.mutate_config(mutate, refresh_helper=True)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return device


@api_put("/devices/{screen_id:str}", tags=["Devices"])
async def update_device(request: Request, screen_id: str, data: DeviceUpdateModel) -> DeviceModel:
    state = await _get_state(request)

    def mutate(config: Config) -> DeviceModel:
        for device in config.devices:
            if device.get("screen_id") == screen_id:
                new_screen_id = data.screen_id or device.get("screen_id", "")
                if new_screen_id != screen_id and any(
                    d.get("screen_id") == new_screen_id for d in config.devices
                ):
                    raise ValueError("Another device with this screen_id already exists")
                device["screen_id"] = new_screen_id
                if data.name is not None:
                    device["name"] = _normalize_name(data.name, new_screen_id)
                if data.offset is not None:
                    device["offset"] = int(data.offset)
                return _serialize_device(device)
        raise LookupError("Device not found")

    try:
        device = await state.mutate_config(mutate, refresh_helper=True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return device


@api_delete("/devices/{screen_id:str}", status_code=HTTP_204_NO_CONTENT, tags=["Devices"])
async def remove_device(request: Request, screen_id: str) -> None:
    state = await _get_state(request)

    def mutate(config: Config) -> None:
        for index, device in enumerate(config.devices):
            if device.get("screen_id") == screen_id:
                config.devices.pop(index)
                return
        raise LookupError("Device not found")

    try:
        await state.mutate_config(mutate, refresh_helper=True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_get("/devices/discover", tags=["Devices"])
async def discover_devices(request: Request) -> list[DeviceModel]:
    state = await _get_state(request)

    async def discover(helper: api_helpers.ApiHelper) -> list[DeviceModel]:
        devices = await helper.discover_youtube_devices_dial()
        valid_devices = [device for device in devices if device]
        return [_serialize_device(device) for device in valid_devices]

    devices = await state.with_api_helper(discover)
    return devices


@api_post("/devices/pair", status_code=HTTP_201_CREATED, tags=["Devices"])
async def pair_device(request: Request, data: PairDeviceRequest) -> DeviceModel:
    state = await _get_state(request)
    try:
        device = await state.pair_device(data.pairing_code, data.name)
    except ValueError as exc:
        message = str(exc)
        message_lower = message.lower()
        if "exists" in message_lower:
            status_code = 409
        elif "failed" in message_lower:
            status_code = 502
        else:
            status_code = 400
        raise HTTPException(status_code=status_code, detail=message) from exc
    return device


@api_get("/channels", tags=["Channels"])
async def list_channels(request: Request) -> list[ChannelModel]:
    state = await _get_state(request)
    snapshot = await state.get_config_snapshot()
    return snapshot.channel_whitelist


@api_post("/channels", status_code=HTTP_201_CREATED, tags=["Channels"])
async def add_channel(request: Request, data: ChannelAddRequest) -> ChannelModel:
    state = await _get_state(request)

    def mutate(config: Config) -> ChannelModel:
        if any(channel.get("id") == data.channel_id for channel in config.channel_whitelist):
            raise ValueError("Channel already whitelisted")
        channel_entry = {
            "id": data.channel_id,
            "name": _normalize_name(data.name, data.channel_id),
        }
        config.channel_whitelist.append(channel_entry)
        return _serialize_channel(channel_entry)

    try:
        channel = await state.mutate_config(mutate, refresh_helper=True)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return channel


@api_delete("/channels/{channel_id:str}", status_code=HTTP_204_NO_CONTENT, tags=["Channels"])
async def remove_channel(request: Request, channel_id: str) -> None:
    state = await _get_state(request)

    def mutate(config: Config) -> None:
        for index, channel in enumerate(config.channel_whitelist):
            if channel.get("id") == channel_id:
                config.channel_whitelist.pop(index)
                return
        raise LookupError("Channel not found")

    try:
        await state.mutate_config(mutate, refresh_helper=True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_get("/channels/search", tags=["Channels"])
async def search_channels(
    request: Request,
    search_query: Annotated[str, Parameter(query="query", required=True)],
) -> list[ChannelSearchResult]:
    state = await _get_state(request)
    config_snapshot = await state.get_config_snapshot()
    if not config_snapshot.apikey:
        raise HTTPException(
            status_code=400,
            detail="YouTube API key must be set before searching for channels.",
        )
    if not search_query.strip():
        raise HTTPException(status_code=400, detail="Query parameter cannot be empty.")

    async def search(helper: api_helpers.ApiHelper) -> list[ChannelSearchResult]:
        channels = await helper.search_channels(search_query)
        return [
            ChannelSearchResult(id=channel_id, name=name, subscriber_count=str(subs))
            for channel_id, name, subs in channels
        ]

    return await state.with_api_helper(search)


def create_app(data_dir: str, *, debug: bool = False) -> Litestar | FrontendApp:
    api_state = ApiState(data_dir)
    auth_settings = _get_auth_settings()

    async def on_startup(app: Litestar) -> None:
        app.state.api_state = api_state
        app.state.auth_settings = auth_settings
        await api_state.startup()

    async def on_shutdown(app: Litestar) -> None:
        await api_state.shutdown()

    route_handlers = [
        root_status,
        health_check,
        login,
        api_root,
        get_config,
        update_config,
        get_skip_category_options,
        list_devices,
        add_device,
        update_device,
        remove_device,
        discover_devices,
        pair_device,
        list_channels,
        add_channel,
        remove_channel,
        search_channels,
    ]

    docs_enabled = _docs_enabled()
    frontend_dist = _resolve_frontend_dist()

    app = Litestar(
        route_handlers=route_handlers,
        on_startup=[on_startup],
        on_shutdown=[on_shutdown],
        debug=debug,
        openapi_config=OPENAPI_CONFIG if docs_enabled else None,
        middleware=[
            DefineMiddleware(
                JWTAuthMiddleware,
                auth_settings=auth_settings,
                exempt_paths=EXEMPT_PATHS,
                api_prefix=API_PREFIX,
            ),
        ],
    )

    if frontend_dist is not None:
        return FrontendApp(app, dist=frontend_dist)
    return app


__all__ = [
    "create_app",
    "ConfigResponse",
    "DeviceModel",
    "ChannelModel",
]
