import asyncio
import logging
import multiprocessing
import os
import signal
import sqlite3
import sys
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, Optional

import aiohttp

from . import api_helpers, ytlounge
from .debug_helpers import AiohttpTracer


@dataclass
class DeviceSnapshot:
    screen_id: str
    name: str
    offset: float


@dataclass
class ListenerHandle:
    snapshot: DeviceSnapshot
    listener: "DeviceListener"
    loop_task: asyncio.Task
    refresh_task: asyncio.Task


class DeviceListener:
    def __init__(self, api_helper, config, device, debug: bool, web_session):
        self.task: Optional[asyncio.Task] = None
        self.api_helper = api_helper
        self.offset = device.offset
        self.name = device.name
        self.cancelled = False
        self.logger = logging.getLogger(f"SponsorBlockTVWeb-{device.screen_id}")
        self.web_session = web_session
        self.lounge_controller = ytlounge.YtLoungeApi(
            device.screen_id, config, api_helper, self.logger
        )

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
            except BaseException:
                pass
            while not lounge_controller.connected() and not self.cancelled:
                # Doesn't connect to the device if it's a kids profile (it's broken)
                self.logger.debug("Waiting for device to be connected")
                await asyncio.sleep(10)
                try:
                    await lounge_controller.connect()
                except BaseException:
                    pass
            self.logger.info(
                "Connected to device %s (%s)", lounge_controller.screen_name, self.name
            )
            try:
                self.logger.debug("Subscribing to lounge")
                sub = await lounge_controller.subscribe_monitored(self)
                await sub
            except BaseException:
                pass

    # Method called on playback state change
    async def __call__(self, state):
        time_start = time.monotonic()
        try:
            self.task.cancel()
        except BaseException:
            pass
        self.task = asyncio.create_task(self.process_playstatus(state, time_start))

    # Processes the playback state change
    async def process_playstatus(self, state, time_start):
        segments = []
        if state.videoId:
            segments = await self.api_helper.get_segments(state.videoId)
        if state.state.value == 1:  # Playing
            self.logger.info("Playing video %s with %d segments", state.videoId, len(segments))
            if segments:  # If there are segments
                await self.time_to_segment(segments, state.currentTime, time_start)

    # Finds the next segment to skip to and skips to it
    async def time_to_segment(self, segments, position, time_start):
        start_next_segment = None
        next_segment = None
        for segment in segments:
            segment_start = segment["start"]
            segment_end = segment["end"]
            is_within_start_range = (
                position < 1 < segment_end and segment_start <= position < segment_end
            )
            is_beyond_current_position = segment_start > position

            if is_within_start_range or is_beyond_current_position:
                next_segment = segment
                start_next_segment = position if is_within_start_range else segment_start
                break
        if start_next_segment:
            time_to_next = (
                (start_next_segment - position - (time.monotonic() - time_start))
                / self.lounge_controller.playback_speed
            ) - self.offset
            await self.skip(time_to_next, next_segment["end"], next_segment["UUID"])

    # Skips to the next segment (waits for the time to pass)
    async def skip(self, time_to, position, uuids):
        await asyncio.sleep(time_to)
        self.logger.info("Skipping segment: seeking to %s", position)
        await asyncio.gather(
            asyncio.create_task(self.lounge_controller.seek_to(position)),
            asyncio.create_task(self.api_helper.mark_viewed_segments(uuids)),
        )

    async def cancel(self):
        self.cancelled = True
        await self.lounge_controller.disconnect()
        if self.task:
            self.task.cancel()
        if self.lounge_controller.subscribe_task_watchdog:
            self.lounge_controller.subscribe_task_watchdog.cancel()
        if self.lounge_controller.subscribe_task:
            self.lounge_controller.subscribe_task.cancel()
        await asyncio.gather(
            self.task,
            self.lounge_controller.subscribe_task_watchdog,
            self.lounge_controller.subscribe_task,
            return_exceptions=True,
        )

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
    return DeviceSnapshot(screen_id=screen_id, name=name, offset=offset)


def _snapshot_changed(existing: DeviceSnapshot, new: DeviceSnapshot) -> bool:
    if existing.name != new.name:
        return True
    return abs(existing.offset - new.offset) > 1e-3


async def _load_device_snapshots(data_dir: str) -> Dict[str, DeviceSnapshot]:
    def _read() -> Dict[str, DeviceSnapshot]:
        db_path = os.path.join(data_dir, "config.db")
        if not os.path.exists(db_path):
            return {}
        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT screen_id, name, offset FROM devices").fetchall()
        finally:
            conn.close()
        result: Dict[str, DeviceSnapshot] = {}
        for screen_id, name, offset in rows:
            normalized_id = str(screen_id or "").strip()
            if not normalized_id:
                continue
            readable_name = str(name or normalized_id)
            offset_seconds = float(offset or 0) / 1000.0
            result[normalized_id] = DeviceSnapshot(
                screen_id=normalized_id,
                name=readable_name,
                offset=offset_seconds,
            )
        return result

    return await asyncio.to_thread(_read)


async def monitor_devices(
    data_dir: str,
    listeners: Dict[str, ListenerHandle],
    start_listener: Callable[[DeviceSnapshot], Awaitable[ListenerHandle]],
) -> None:
    try:
        while True:
            await asyncio.sleep(5)
            desired = await _load_device_snapshots(data_dir)
            for screen_id, snapshot in desired.items():
                handle = listeners.get(screen_id)
                if handle is None:
                    listeners[screen_id] = await start_listener(snapshot)
                    continue
                if _snapshot_changed(handle.snapshot, snapshot):
                    await stop_listener(handle)
                    listeners[screen_id] = await start_listener(snapshot)
            for screen_id in list(listeners.keys()):
                if screen_id not in desired:
                    await stop_listener(listeners.pop(screen_id))
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

    api_helper = api_helpers.ApiHelper(config, web_session)
    listeners: Dict[str, ListenerHandle] = {}

    async def start_listener(snapshot: DeviceSnapshot) -> ListenerHandle:
        listener = DeviceListener(api_helper, config, snapshot, debug, web_session)
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


def _run_service_process() -> None:
    from .helpers import Config

    data_dir = _get_env("SBTV_DATA_DIR", "data")
    debug = _as_bool(_get_env("SBTV_DEBUG"), False)
    http_tracing = _as_bool(_get_env("SBTV_HTTP_TRACING"), False)

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
    port = int(_get_env("SBTV_API_PORT", "8000"))
    debug = _as_bool(_get_env("SBTV_DEBUG"), False)

    app = create_app(data_dir, debug=debug)
    uvicorn.run(app, host=host, port=port)


def main() -> None:
    enable_service = _as_bool(_get_env("SBTV_ENABLE_SERVICE"), True)
    enable_api = _as_bool(_get_env("SBTV_ENABLE_API"), True)

    if not (enable_service or enable_api):
        print("Both SBTV_ENABLE_SERVICE and SBTV_ENABLE_API are disabled. Exiting.", file=sys.stderr)
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
