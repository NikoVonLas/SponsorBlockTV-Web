import multiprocessing
import os
import signal
import sys
from typing import Optional


def _as_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is not None:
        return value
    return default


def run_service() -> None:
    from sponsorblocktv_web.helpers import Config
    from sponsorblocktv_web.main import main as run_main

    data_dir = _get_env("SBTV_DATA_DIR", "data")
    debug = _as_bool(_get_env("SBTV_DEBUG"), False)
    http_tracing = _as_bool(_get_env("SBTV_HTTP_TRACING"), False)

    config = Config(data_dir)
    config.validate()
    run_main(config, debug, http_tracing)


def run_api() -> None:
    from sponsorblocktv_web.api_app import create_app

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - dependency should be present
        raise RuntimeError("uvicorn is required but not installed inside the container") from exc

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
        processes.append(multiprocessing.Process(target=run_service, name="SBTV-Service"))
    if enable_api:
        processes.append(multiprocessing.Process(target=run_api, name="SBTV-API"))

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
