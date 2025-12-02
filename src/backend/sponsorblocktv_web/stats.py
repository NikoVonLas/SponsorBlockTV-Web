"""Helpers for storing and querying playback statistics."""

from __future__ import annotations

import asyncio
import os
import sqlite3
import time
from collections import defaultdict
from contextlib import closing
from typing import Dict, Iterable, Optional

GLOBAL_DEVICE_ID = "__global__"


class StatsRecorder:
    def __init__(self, data_dir: str):
        self.db_path = os.path.join(data_dir, "config.db")

    def _increment(
        self, conn: sqlite3.Connection, device_id: str, metric: str, amount: float
    ) -> None:
        conn.execute(
            """
            INSERT INTO stats(device_id, metric, value) VALUES(?, ?, ?)
            ON CONFLICT(device_id, metric) DO UPDATE SET value = value + excluded.value
            """,
            (device_id, metric, amount),
        )

    def _increment_internal(self, device_id: str, metric: str, amount: float) -> None:
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            self._increment(conn, device_id, metric, amount)
            if device_id != GLOBAL_DEVICE_ID:
                self._increment(conn, GLOBAL_DEVICE_ID, metric, amount)
            conn.commit()

    async def increment(self, device_id: str, metric: str, amount: float) -> None:
        await asyncio.to_thread(
            self._increment_internal, device_id or GLOBAL_DEVICE_ID, metric, amount
        )

    async def record_video_started(self, device_id: str) -> None:
        await self.increment(device_id, "videos_watched", 1)

    async def record_watch_time(self, device_id: str, seconds: float) -> None:
        if seconds <= 0:
            return
        await self.increment(device_id, "watch_time_seconds", seconds)

    async def record_segment_skip(
        self,
        device_id: str,
        count: int,
        saved_seconds: float,
        categories: Optional[Iterable[str]] = None,
    ) -> None:
        if count > 0:
            await self.increment(device_id, "segments_skipped", count)
        if saved_seconds > 0:
            await self.increment(device_id, "time_saved_seconds", saved_seconds)
        if categories:
            categories = list(categories)
            for category in categories:
                await self.increment(device_id, f"skip_category_{category}", 1)
            if saved_seconds > 0:
                per_category = saved_seconds / max(len(categories), 1)
                for category in categories:
                    await self.increment(device_id, f"time_saved_category_{category}", per_category)
        await self.set_metric(device_id, "last_seen", time.time())

    def _set(self, conn: sqlite3.Connection, device_id: str, metric: str, value: float) -> None:
        conn.execute(
            """
            INSERT INTO stats(device_id, metric, value) VALUES(?, ?, ?)
            ON CONFLICT(device_id, metric) DO UPDATE SET value = excluded.value
            """,
            (device_id, metric, value),
        )

    def _set_internal(self, device_id: str, metric: str, value: float) -> None:
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            self._set(conn, device_id, metric, value)
            if device_id != GLOBAL_DEVICE_ID:
                self._set(conn, GLOBAL_DEVICE_ID, metric, value)
            conn.commit()

    async def set_metric(self, device_id: str, metric: str, value: float) -> None:
        await asyncio.to_thread(self._set_internal, device_id or GLOBAL_DEVICE_ID, metric, value)

    async def mark_device_seen(self, device_id: str) -> None:
        await self.set_metric(device_id, "last_seen", time.time())


def _read_stats(db_path: str, device_filter: str | None = None) -> Dict[str, Dict[str, float]]:
    rows: Iterable[tuple[str, str, float]]
    with closing(sqlite3.connect(db_path)) as conn:
        if device_filter is None:
            rows = conn.execute("SELECT device_id, metric, value FROM stats")
        else:
            rows = conn.execute(
                "SELECT device_id, metric, value FROM stats WHERE device_id IN (?, ?)",
                (device_filter, GLOBAL_DEVICE_ID),
            )
        stats_map: Dict[str, Dict[str, float]] = defaultdict(dict)
        for device_id, metric, value in rows:
            stats_map[device_id][metric] = value
        return stats_map


def load_all_stats(data_dir: str) -> Dict[str, Dict[str, float]]:
    db_path = os.path.join(data_dir, "config.db")
    return _read_stats(db_path)


def load_device_stats(data_dir: str, device_id: str) -> Dict[str, Dict[str, float]]:
    db_path = os.path.join(data_dir, "config.db")
    return _read_stats(db_path, device_id)
