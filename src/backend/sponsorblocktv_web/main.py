import asyncio
import logging
import multiprocessing
import os
import signal
import sqlite3
import sys
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

import aiohttp

from . import api_helpers, stats, ytlounge
from .device_overrides import resolve_preferences, sanitize_stored_overrides
from .debug_helpers import AiohttpTracer


@dataclass
class DeviceSnapshot:
    screen_id: str
    name: str
    offset: float
    overrides: dict[str, Any]


@dataclass
class ListenerHandle:
    snapshot: DeviceSnapshot
    listener: "DeviceListener"
    loop_task: asyncio.Task
    refresh_task: asyncio.Task


class DeviceListener:
    SEGMENT_EPSILON = 0.25
    WATCH_FLUSH_INTERVAL = 5.0  # seconds between watch-time flushes while playing

    def __init__(self, data_dir: str, preferences, device, debug: bool, web_session):
        self.skip_task: Optional[asyncio.Task] = None
        self.skip_task_video: Optional[str] = None
        self.skip_task_segment_start: Optional[float] = None
        self.preferences = preferences
        self.api_helper = api_helpers.ApiHelper(preferences, web_session)
        self.offset = device.offset
        self.name = device.name
        self.cancelled = False
        self.logger = logging.getLogger(f"SponsorBlockTVWeb-{device.screen_id}")
        self.web_session = web_session
        self.lounge_controller = ytlounge.YtLoungeApi(
            device.screen_id, preferences, self.api_helper, self.logger
        )
        self.device_id = device.screen_id
        self.stats = stats.StatsRecorder(data_dir)
        self.current_video_id: Optional[str] = None
        self.current_cpn: Optional[str] = None
        self.last_state_value: Optional[int] = None
        self.last_video_position: float = 0.0
        self.playback_started_at: Optional[float] = None
        self.last_watch_emit_at: Optional[float] = None
        self.watch_heartbeat_task: Optional[asyncio.Task] = None
        self.state_queue: asyncio.Queue[Tuple[Any, float]] = asyncio.Queue(maxsize=1)
        self.processor_task = asyncio.create_task(self._state_processor())
        self.completed_segment_uuids: set[str] = set()

    # Ensures that we have a valid auth token
    async def refresh_auth_loop(self):
        while True:
            await asyncio.sleep(60 * 60 * 24)  # Refresh every 24 hours
            try:
                await self.lounge_controller.refresh_auth()
            except BaseException:
                pass

    async def is_available(self):
        try:
            return await self.lounge_controller.is_available()
        except BaseException:
            return False

    # Main subscription loop
    async def loop(self):
        lounge_controller = self.lounge_controller
        while not self.cancelled:
            while not lounge_controller.linked():
                try:
                    self.logger.debug("Refreshing auth")
                    await lounge_controller.refresh_auth()
                except BaseException:
                    await asyncio.sleep(10)
            while not (await self.is_available()) and not self.cancelled:
                self.logger.debug("Waiting for device to be available")
                await asyncio.sleep(10)
            try:
                await lounge_controller.connect()
                self.logger.info(
                    "Connected to device %s (%s)", lounge_controller.screen_name, self.name
                )
            except BaseException:
                self.logger.exception("Connect failed; retrying")
                await asyncio.sleep(5)
                continue
            while not lounge_controller.connected() and not self.cancelled:
                self.logger.debug("Waiting for device to be connected")
                await asyncio.sleep(2)
                try:
                    await lounge_controller.connect()
                except BaseException:
                    self.logger.exception("Retry connect failed")
            try:
                self.logger.debug("Subscribing to lounge")
                sub = await lounge_controller.subscribe_monitored(self)
                await sub
                self.logger.info(
                    "Subscribe coroutine completed (connected=%s)", lounge_controller.connected()
                )
            except asyncio.CancelledError:
                raise
            except BaseException:
                self.logger.exception("Subscribe loop failed")

    # Method called on playback state change
    async def __call__(self, state):
        time_start = time.monotonic()
        self.logger.debug(
            "Playback callback: video=%s state=%s current=%s",
            getattr(state, "videoId", None),
            getattr(getattr(state, "state", None), "value", getattr(state, "state", None)),
            getattr(state, "currentTime", None),
        )
        await self._enqueue_state(state, time_start)

    async def _enqueue_state(self, state, time_start):
        try:
            self.state_queue.put_nowait((state, time_start))
        except asyncio.QueueFull:
            try:
                self.state_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.state_queue.put_nowait((state, time_start))

    async def _state_processor(self):
        try:
            while not self.cancelled:
                state, time_start = await self.state_queue.get()
                try:
                    await self.process_playstatus(state, time_start)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    self.logger.exception("process_playstatus failed")
        except asyncio.CancelledError:
            pass

    # Processes the playback state change
    async def process_playstatus(self, state, time_start):
        await self.stats.mark_device_seen(self.device_id)
        segments = []
        video_id = getattr(state, "videoId", None)
        cpn = getattr(state, "cpn", None)
        should_reset_watch = False
        if cpn and cpn != self.current_cpn:
            should_reset_watch = True
        if video_id and video_id != self.current_video_id:
            should_reset_watch = True
        if should_reset_watch:
            await self._finalize_watch_session(time_start)
        if cpn and cpn != self.current_cpn:
            self.current_cpn = cpn
            self.completed_segment_uuids.clear()
        if video_id:
            if video_id != self.current_video_id:
                self.current_video_id = video_id
                await self.stats.record_video_started(self.device_id)
                self.completed_segment_uuids.clear()
            segments_data = await self.api_helper.get_segments(video_id)
            if isinstance(segments_data, tuple):
                segments = segments_data[0] or []
            else:
                segments = segments_data or []
        await self._record_watch_time(state, time_start)
        state_value = self._extract_state_value(getattr(state, "state", None))
        if state_value == 1:
            self.logger.info("Playing video %s with %d segments", video_id, len(segments))
            if segments:
                position = self._extract_position(state)
                await self._schedule_skip(video_id, segments, position, time_start)
        else:
            await self._cancel_skip_task()

    async def _record_watch_time(self, state, time_start: float) -> None:
        state_value = self._extract_state_value(getattr(state, "state", None))
        position = self._extract_position(state)

        if state_value == 1:
            if self.playback_started_at is None:
                self.playback_started_at = time_start
                self.last_watch_emit_at = time_start
                self._ensure_watch_heartbeat()
            else:
                last_emit = self.last_watch_emit_at or self.playback_started_at
                if time_start - last_emit >= self.WATCH_FLUSH_INTERVAL:
                    await self._flush_watch_time(time_start)
        else:
            await self._finalize_watch_session(time_start)
        self.last_state_value = state_value
        self.last_video_position = position

    async def _flush_watch_time(self, now: float) -> None:
        if self.playback_started_at is None:
            return
        last_emit = self.last_watch_emit_at or self.playback_started_at
        delta = now - last_emit
        if delta <= 0:
            return
        await self.stats.record_watch_time(self.device_id, delta)
        self.last_watch_emit_at = now

    async def _finalize_watch_session(self, now: float) -> None:
        await self._flush_watch_time(now)
        self.playback_started_at = None
        self.last_watch_emit_at = None

    def _ensure_watch_heartbeat(self) -> None:
        if self.watch_heartbeat_task and not self.watch_heartbeat_task.done():
            return
        self.watch_heartbeat_task = asyncio.create_task(self._watch_heartbeat_loop())

    async def _watch_heartbeat_loop(self) -> None:
        try:
            while not self.cancelled:
                await asyncio.sleep(self.WATCH_FLUSH_INTERVAL)
                if self.playback_started_at is None:
                    continue
                now = time.monotonic()
                try:
                    await self._flush_watch_time(now)
                    await self.stats.mark_device_seen(self.device_id)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    self.logger.exception("Watch heartbeat tick failed")
        except asyncio.CancelledError:
            pass
        finally:
            self.watch_heartbeat_task = None

    # Finds the next segment to skip to and skips to it
    # Skips to the next segment (waits for the time to pass)
    async def skip(self, time_to, position, uuids, saved_duration, categories):
        if time_to > 0:
            await asyncio.sleep(time_to)
        self.logger.info("Skipping segment: seeking to %s", position)
        await asyncio.gather(
            asyncio.create_task(self.lounge_controller.seek_to(position)),
            asyncio.create_task(self.api_helper.mark_viewed_segments(uuids)),
        )
        await self.stats.record_segment_skip(
            self.device_id,
            len(uuids),
            saved_duration,
            categories,
        )

    async def _schedule_skip(self, video_id, segments, position, time_start):
        next_segment = self._select_next_segment(video_id, segments, position)
        if not next_segment:
            await self._cancel_skip_task()
            return

        segment_start = next_segment["start"]
        segment_end = next_segment["end"]
        uuid_list = next_segment["UUID"]
        categories = next_segment.get("categories", [])
        start_next_segment = position if segment_start <= position < segment_end else segment_start
        same_plan = (
            self.skip_task
            and not self.skip_task.done()
            and self.skip_task_video == video_id
            and self.skip_task_segment_start is not None
            and abs(self.skip_task_segment_start - start_next_segment) < 0.05
        )
        if same_plan:
            return

        await self._cancel_skip_task()
        self.skip_task_video = video_id
        self.skip_task_segment_start = start_next_segment
        self.logger.debug(
            "Scheduling skip task video=%s start=%.3f end=%.3f position=%.3f",
            video_id,
            start_next_segment,
            segment_end,
            position,
        )
        self.skip_task = asyncio.create_task(
            self._wait_and_skip(
                start_next_segment,
                segment_end,
                uuid_list,
                categories,
                position,
                time_start,
            )
        )

    async def _cancel_skip_task(self):
        if not self.skip_task:
            return
        self.skip_task.cancel()
        try:
            await self.skip_task
        except asyncio.CancelledError:
            pass
        except Exception:
            self.logger.exception("Skip task failed")
        finally:
            self.skip_task = None
            self.skip_task_video = None
            self.skip_task_segment_start = None

    @staticmethod
    def _extract_state_value(state_obj) -> int:
        if hasattr(state_obj, "value"):
            state_obj = state_obj.value
        try:
            return int(state_obj)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _extract_position(state) -> float:
        try:
            return float(getattr(state, "currentTime", 0) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def _select_next_segment(self, video_id, segments, position):
        for segment in segments:
            segment_start = segment["start"]
            segment_end = segment["end"]
            if segment_start > segment_end:
                continue
            uuid_list = segment.get("UUID", [])
            if uuid_list and all(uuid in self.completed_segment_uuids for uuid in uuid_list):
                continue
            within_current = segment_start <= position < segment_end - self.SEGMENT_EPSILON
            future_segment = segment_start > position
            if within_current or future_segment:
                return segment
        return None

    async def _wait_and_skip(
        self,
        start_next_segment,
        segment_end,
        uuid_list,
        categories,
        position,
        time_start,
    ):
        try:
            elapsed = time.monotonic() - time_start
            time_to_next = (
                (start_next_segment - position - elapsed) / self.lounge_controller.playback_speed
            ) - self.offset
            if time_to_next < 0:
                time_to_next = 0
            saved_duration = max(segment_end - start_next_segment, 0)
            self.logger.debug(
                "Next segment at %.3f (current %.3f), skipping in %.3fs",
                start_next_segment,
                position,
                time_to_next,
            )
            await self.skip(time_to_next, segment_end, uuid_list, saved_duration, categories)
            if uuid_list:
                self.completed_segment_uuids.update(uuid_list)
        finally:
            self.skip_task = None
            self.skip_task_video = None
            self.skip_task_segment_start = None

    async def cancel(self):
        self.cancelled = True
        await self._finalize_watch_session(time.monotonic())
        await self.lounge_controller.disconnect()
        if self.processor_task:
            self.processor_task.cancel()
        await self._cancel_skip_task()
        if self.watch_heartbeat_task:
            self.watch_heartbeat_task.cancel()
        if self.lounge_controller.subscribe_task_watchdog:
            self.lounge_controller.subscribe_task_watchdog.cancel()
        if self.lounge_controller.subscribe_task:
            self.lounge_controller.subscribe_task.cancel()
        heartbeat_task = self.watch_heartbeat_task
        await asyncio.gather(
            *(
                task
                for task in (
                    self.processor_task,
                    self.lounge_controller.subscribe_task_watchdog,
                    self.lounge_controller.subscribe_task,
                    heartbeat_task,
                )
                if task
            ),
            return_exceptions=True,
        )
        self.watch_heartbeat_task = None

    async def initialize_web_session(self):
        await self.lounge_controller.change_web_session(self.web_session)


async def stop_listener(handle: ListenerHandle) -> None:
    await handle.listener.cancel()
    for task in (handle.loop_task, handle.refresh_task):
        if task:
            task.cancel()
    await asyncio.gather(
        *(task for task in (handle.loop_task, handle.refresh_task) if task),
        return_exceptions=True,
    )


async def finish(
    listeners: Dict[str, ListenerHandle],
    monitor_task: Optional[asyncio.Task],
    web_session,
    tcp_connector,
) -> None:
    if monitor_task:
        monitor_task.cancel()
        await asyncio.gather(monitor_task, return_exceptions=True)
    await asyncio.gather(
        *(stop_listener(handle) for handle in list(listeners.values())),
        return_exceptions=True,
    )
    listeners.clear()
    await web_session.close()
    await tcp_connector.close()


def handle_signal(signum, frame):
    raise KeyboardInterrupt()


def _snapshot_from_device(device) -> DeviceSnapshot:
    screen_id = str(getattr(device, "screen_id", "") or "")
    name = str(getattr(device, "name", "") or screen_id)
    offset = float(getattr(device, "offset", 0) or 0.0)
    if hasattr(device, "__dict__"):
        raw_overrides = getattr(device, "overrides", {})
    elif isinstance(device, dict):
        raw_overrides = device.get("overrides", {})
    else:
        raw_overrides = {}
    overrides = sanitize_stored_overrides(raw_overrides)
    return DeviceSnapshot(screen_id=screen_id, name=name, offset=offset, overrides=overrides)


def _snapshot_changed(existing: DeviceSnapshot, new: DeviceSnapshot) -> bool:
    if existing.name != new.name:
        return True
    if existing.overrides != new.overrides:
        return True
    return abs(existing.offset - new.offset) > 1e-3


MONITOR_LOGGER = logging.getLogger("SponsorBlockTVWeb.Monitor")


async def _load_device_snapshots(data_dir: str) -> Dict[str, DeviceSnapshot]:
    def _read() -> Dict[str, DeviceSnapshot]:
        db_path = os.path.join(data_dir, "config.db")
        if not os.path.exists(db_path):
            return {}
        conn = sqlite3.connect(db_path, timeout=30)
        try:
            rows = conn.execute("SELECT screen_id, name, offset, overrides FROM devices").fetchall()
        finally:
            conn.close()
        result: Dict[str, DeviceSnapshot] = {}
        for screen_id, name, offset, overrides_raw in rows:
            normalized_id = str(screen_id or "").strip()
            if not normalized_id:
                continue
            readable_name = str(name or normalized_id)
            offset_seconds = float(offset or 0) / 1000.0
            overrides = sanitize_stored_overrides(overrides_raw)
            result[normalized_id] = DeviceSnapshot(
                screen_id=normalized_id,
                name=readable_name,
                offset=offset_seconds,
                overrides=overrides,
            )
        return result

    return await asyncio.to_thread(_read)


async def monitor_devices(
    data_dir: str,
    listeners: Dict[str, ListenerHandle],
    start_listener: Callable[[DeviceSnapshot], Awaitable[ListenerHandle]],
) -> None:
    logger = MONITOR_LOGGER
    try:
        while True:
            await asyncio.sleep(5)
            try:
                desired = await _load_device_snapshots(data_dir)
            except Exception:  # pragma: no cover
                logger.exception("Failed to read device snapshot; retrying shortly")
                continue
            for screen_id, snapshot in desired.items():
                handle = listeners.get(screen_id)
                if handle is None:
                    try:
                        listeners[screen_id] = await start_listener(snapshot)
                    except Exception:  # pragma: no cover
                        logger.exception("Failed to start listener for %s", screen_id)
                    continue
                if _snapshot_changed(handle.snapshot, snapshot):
                    try:
                        await stop_listener(handle)
                    except Exception:  # pragma: no cover
                        logger.exception("Failed to stop listener for %s", screen_id)
                    try:
                        listeners[screen_id] = await start_listener(snapshot)
                    except Exception:  # pragma: no cover
                        listeners.pop(screen_id, None)
                        logger.exception("Failed to restart listener for %s", screen_id)
            for screen_id in list(listeners.keys()):
                if screen_id not in desired:
                    handle = listeners.pop(screen_id)
                    try:
                        await stop_listener(handle)
                    except Exception:  # pragma: no cover
                        logger.exception("Failed to stop listener for %s", screen_id)
    except asyncio.CancelledError:
        return


async def main_async(config, debug, http_tracing):
    loop = asyncio.get_event_loop_policy().get_event_loop()
    if debug:
        loop.set_debug(True)

    tcp_connector = aiohttp.TCPConnector(ttl_dns_cache=300)

    # Configure session with tracing if enabled
    if http_tracing:
        root_logger = logging.getLogger("aiohttp_trace")
        tracer = AiohttpTracer(root_logger)
        trace_config = aiohttp.TraceConfig()
        trace_config.on_request_start.append(tracer.on_request_start)
        trace_config.on_response_chunk_received.append(tracer.on_response_chunk_received)
        trace_config.on_request_end.append(tracer.on_request_end)
        trace_config.on_request_exception.append(tracer.on_request_exception)
        web_session = aiohttp.ClientSession(
            trust_env=config.use_proxy, connector=tcp_connector, trace_configs=[trace_config]
        )
    else:
        web_session = aiohttp.ClientSession(trust_env=config.use_proxy, connector=tcp_connector)

    listeners: Dict[str, ListenerHandle] = {}

    async def start_listener(snapshot: DeviceSnapshot) -> ListenerHandle:
        preferences = resolve_preferences(config, snapshot.overrides)
        listener = DeviceListener(config.data_dir, preferences, snapshot, debug, web_session)
        await listener.initialize_web_session()
        loop_task = loop.create_task(listener.loop())
        refresh_task = loop.create_task(listener.refresh_auth_loop())
        return ListenerHandle(
            snapshot=snapshot,
            listener=listener,
            loop_task=loop_task,
            refresh_task=refresh_task,
        )

    for device in config.devices:
        snapshot = _snapshot_from_device(device)
        if not snapshot.screen_id:
            continue
        listeners[snapshot.screen_id] = await start_listener(snapshot)

    monitor_task = loop.create_task(monitor_devices(config.data_dir, listeners, start_listener))

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        print("Cancelling tasks and exiting...")
    finally:
        await finish(listeners, monitor_task, web_session, tcp_connector)
        print("Exited")


def run_service(config, debug, http_tracing):
    asyncio.run(main_async(config, debug, http_tracing))


def _as_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is not None:
        return value
    return default


def _configure_logging(debug: bool) -> None:
    """Ensure each process logs to stdout respecting SBTV_DEBUG."""
    level = logging.DEBUG if debug else logging.INFO
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )
        root_logger.addHandler(handler)
    root_logger.setLevel(level)
    for handler in root_logger.handlers:
        handler.setLevel(level)


def _run_service_process() -> None:
    from .helpers import Config

    data_dir = _get_env("SBTV_DATA_DIR", "data")
    debug = _as_bool(_get_env("SBTV_DEBUG"), False)
    http_tracing = _as_bool(_get_env("SBTV_HTTP_TRACING"), False)
    _configure_logging(debug)

    config = Config(data_dir)
    config.validate()
    run_service(config, debug, http_tracing)


def _run_api_process() -> None:
    from .api_app import create_app

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("uvicorn is required but not installed") from exc

    data_dir = _get_env("SBTV_DATA_DIR", "data")
    host = _get_env("SBTV_API_HOST", "0.0.0.0")
    port = int(_get_env("SBTV_API_PORT", "80"))
    debug = _as_bool(_get_env("SBTV_DEBUG"), False)
    _configure_logging(debug)

    app = create_app(data_dir, debug=debug)
    uvicorn.run(app, host=host, port=port)


def main() -> None:
    debug = _as_bool(_get_env("SBTV_DEBUG"), False)
    _configure_logging(debug)
    enable_service = _as_bool(_get_env("SBTV_ENABLE_SERVICE"), True)
    enable_api = _as_bool(_get_env("SBTV_ENABLE_API"), True)

    if not (enable_service or enable_api):
        print(
            "Both SBTV_ENABLE_SERVICE and SBTV_ENABLE_API are disabled. Exiting.", file=sys.stderr
        )
        sys.exit(1)

    processes: list[multiprocessing.Process] = []

    if enable_service:
        processes.append(multiprocessing.Process(target=_run_service_process, name="SBTV-Service"))
    if enable_api:
        processes.append(multiprocessing.Process(target=_run_api_process, name="SBTV-API"))

    for process in processes:
        process.daemon = True
        process.start()

    def _terminate_processes(*args) -> None:
        exit_code = 0
        if args and isinstance(args[0], int):
            exit_code = args[0]
        for proc in processes:
            if proc.is_alive():
                proc.terminate()
        for proc in processes:
            proc.join()
        sys.exit(exit_code)

    signal.signal(signal.SIGTERM, _terminate_processes)
    signal.signal(signal.SIGINT, _terminate_processes)

    try:
        while processes:
            for proc in list(processes):
                proc.join(timeout=0.5)
                if not proc.is_alive():
                    processes.remove(proc)
                    if proc.exitcode not in (0, None):
                        print(
                            f"{proc.name} exited with code {proc.exitcode}, shutting down container.",
                            file=sys.stderr,
                        )
                        _terminate_processes(proc.exitcode or 1)
    except KeyboardInterrupt:
        _terminate_processes()
    finally:
        for proc in processes:
            if proc.is_alive():
                proc.terminate()
        for proc in processes:
            proc.join()


if __name__ == "__main__":
    main()
