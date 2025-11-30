import json
import logging
import os
import sqlite3
import sys
import time
from contextlib import closing
from typing import Any, Iterable

import rich_click as click
from appdirs import user_data_dir

from . import main
from .constants import config_file_blacklist_keys, github_wiki_base_url


class Device:
    def __init__(self, args_dict):
        self.screen_id = ""
        self.offset = 0
        self.__load(args_dict)
        self.__validate()

    def __load(self, args_dict):
        for i in args_dict:
            setattr(self, i, args_dict[i])
        # Change offset to seconds (from milliseconds)
        self.offset = self.offset / 1000

    def __validate(self):
        if not self.screen_id:
            raise ValueError("No screen id found")


class Config:
    SETTINGS_KEYS = (
        "apikey",
        "skip_count_tracking",
        "mute_ads",
        "skip_ads",
        "minimum_skip_length",
        "auto_play",
        "join_name",
        "use_proxy",
    )

    def __init__(self, data_dir):
        normalized_path = os.path.abspath(data_dir)
        if normalized_path.endswith(".json"):
            self.data_dir = os.path.dirname(normalized_path) or "."
            self.config_file = normalized_path
        else:
            self.data_dir = normalized_path
            self.config_file = os.path.join(self.data_dir, "config.json")
        self.db_path = os.path.join(self.data_dir, "config.db")

        self.devices: list[Any] = []
        self.apikey = ""
        self.skip_categories: list[str] = []
        self.channel_whitelist: list[dict[str, Any]] = []
        self.skip_count_tracking = True
        self.mute_ads = False
        self.skip_ads = False
        self.minimum_skip_length = 1
        self.auto_play = True
        self.join_name = "SponsorBlockTV Web"
        self.use_proxy = False
        self.__load()

    def validate(self):
        if hasattr(self, "atvs"):
            print(
                (
                    "The atvs config option is deprecated and has stopped working."
                    " Please read this for more information "
                    "on how to upgrade to V2:\n"
                    f"{github_wiki_base_url}/Migrate-from-V1-to-V2"
                ),
            )
            print("Exiting in 10 seconds...")
            time.sleep(10)
            sys.exit()
        if not self.devices:
            print("No devices found, please add at least one device")
            print("Exiting in 10 seconds...")
            time.sleep(10)
            sys.exit()
        self.devices = [Device(i) for i in self.devices]
        if not self.apikey and self.channel_whitelist:
            raise ValueError("No youtube API key found and channel whitelist is not empty")
        if not self.skip_categories:
            self.skip_categories = ["sponsor"]
            print("No categories found, using default: sponsor")

    def __load(self):
        if os.path.exists(self.db_path):
            self._load_from_db()
            return

        loaded_from_legacy = self._load_from_json_file()
        if not loaded_from_legacy:
            self._handle_missing_config()
        self.save()

    def _running_in_docker(self) -> bool:
        return bool(os.getenv("SBTV_DOCKER"))

    def _handle_missing_config(self) -> None:
        print("Could not load config file")
        if not os.path.exists(self.data_dir):
            if self._running_in_docker():
                print(
                    "Running in docker without mounting the data dir, check the"
                    " wiki for more information: "
                    f"{github_wiki_base_url}/Installation#Docker"
                )
                print(
                    ("This image has recently been updated to v2, and requires changes."),
                    ("Please read this for more information on how to upgrade to V2:"),
                    f"{github_wiki_base_url}/Migrate-from-V1-to-V2",
                )
                print("Exiting in 10 seconds...")
                time.sleep(10)
                sys.exit()
            print("Creating data directory")
            os.makedirs(self.data_dir, exist_ok=True)
        else:
            print("Blank config database will be created")

    def _load_from_json_file(self) -> bool:
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                config = json.load(f)
        except FileNotFoundError:
            return False
        for key, value in config.items():
            if key in config_file_blacklist_keys:
                continue
            setattr(self, key, value)
        return True

    def _connect(self) -> sqlite3.Connection:
        os.makedirs(self.data_dir, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_tables(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS devices (
                screen_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                offset INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS channel_whitelist (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS skip_categories (
                category TEXT PRIMARY KEY
            )
            """
        )
        conn.commit()

    def _load_from_db(self) -> None:
        with closing(self._connect()) as conn:
            self._ensure_tables(conn)
            cursor = conn.execute("SELECT key, value FROM settings")
            for key, value in cursor.fetchall():
                if key in self.SETTINGS_KEYS:
                    setattr(self, key, json.loads(value))
            categories = conn.execute("SELECT category FROM skip_categories").fetchall()
            self.skip_categories = [row[0] for row in categories]
            devices = conn.execute(
                "SELECT screen_id, name, offset FROM devices ORDER BY name COLLATE NOCASE"
            ).fetchall()
            self.devices = [
                {
                    "screen_id": row[0],
                    "name": row[1],
                    "offset": int(row[2]),
                }
                for row in devices
            ]
            channels = conn.execute(
                "SELECT id, name FROM channel_whitelist ORDER BY name COLLATE NOCASE"
            ).fetchall()
            self.channel_whitelist = [
                {
                    "id": row[0],
                    "name": row[1],
                }
                for row in channels
            ]

    def _serialize_devices(self) -> Iterable[tuple[str, str, int]]:
        serialized = []
        for device in self.devices:
            if hasattr(device, "__dict__"):
                screen_id = str(getattr(device, "screen_id", "") or "")
                name = str(getattr(device, "name", "") or "")
                offset_value = getattr(device, "offset", 0) or 0
                # Device instances store offset in seconds, convert back to ms
                offset = int(float(offset_value) * 1000)
            else:
                screen_id = str(device.get("screen_id", "") or "")
                name = str(device.get("name", "") or "")
                offset = int(device.get("offset", 0) or 0)
            serialized.append((screen_id, name, offset))
        return serialized

    def save(self):
        with closing(self._connect()) as conn:
            self._ensure_tables(conn)
            settings_payload = [
                (key, json.dumps(getattr(self, key))) for key in self.SETTINGS_KEYS
            ]
            conn.executemany(
                """
                INSERT INTO settings(key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                settings_payload,
            )
            conn.execute("DELETE FROM skip_categories")
            if self.skip_categories:
                conn.executemany(
                    "INSERT INTO skip_categories(category) VALUES (?)",
                    [(category,) for category in self.skip_categories],
                )
            conn.execute("DELETE FROM devices")
            device_rows = list(self._serialize_devices())
            if device_rows:
                conn.executemany(
                    "INSERT INTO devices(screen_id, name, offset) VALUES (?, ?, ?)",
                    device_rows,
                )
            conn.execute("DELETE FROM channel_whitelist")
            if self.channel_whitelist:
                conn.executemany(
                    "INSERT INTO channel_whitelist(id, name) VALUES (?, ?)",
                    [
                        (
                            str(channel.get("id", "") or ""),
                            str(channel.get("name", "") or ""),
                        )
                        for channel in self.channel_whitelist
                    ],
                )
            conn.commit()

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Config):
            return False
        return self._export_state() == other._export_state()

    def _export_state(self) -> dict[str, Any]:
        return {
            "devices": [
                {
                    "screen_id": getattr(d, "screen_id", d.get("screen_id") if isinstance(d, dict) else ""),
                    "name": getattr(d, "name", d.get("name") if isinstance(d, dict) else ""),
                    "offset": (
                        int(float(getattr(d, "offset", 0)) * 1000)
                        if hasattr(d, "__dict__")
                        else int(d.get("offset", 0) or 0)
                    ),
                }
                for d in self.devices
            ],
            "apikey": self.apikey,
            "skip_categories": list(self.skip_categories),
            "channel_whitelist": list(self.channel_whitelist),
            "skip_count_tracking": self.skip_count_tracking,
            "mute_ads": self.mute_ads,
            "skip_ads": self.skip_ads,
            "minimum_skip_length": self.minimum_skip_length,
            "auto_play": self.auto_play,
            "join_name": self.join_name,
            "use_proxy": self.use_proxy,
        }


@click.group(invoke_without_command=True)
@click.option(
    "--data",
    "-d",
    default=lambda: os.getenv("SBTV_DATA_DIR") or user_data_dir("SponsorBlockTV Web", "dmunozv04"),
    help="data directory",
)
@click.option("--debug", is_flag=True, help="debug mode")
@click.option("--http-tracing", is_flag=True, help="Enable HTTP request/response tracing")
# legacy commands as arguments
@click.option("--setup", is_flag=True, help="Setup the program graphically", hidden=True)
@click.option(
    "--setup-cli",
    is_flag=True,
    help="Setup the program in the command line",
    hidden=True,
)
@click.pass_context
def cli(ctx, data, debug, http_tracing, setup, setup_cli):
    """SponsorBlockTV Web"""
    ctx.ensure_object(dict)
    ctx.obj["data_dir"] = data
    ctx.obj["debug"] = debug
    ctx.obj["http_tracing"] = http_tracing

    logger = logging.getLogger()
    ctx.obj["logger"] = logger
    sh = logging.StreamHandler()
    sh.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(sh)

    if debug:
        logger.setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.INFO)

    if ctx.invoked_subcommand is None:
        if setup:
            ctx.invoke(setup_command)
        elif setup_cli:
            ctx.invoke(setup_cli_command)
        else:
            ctx.invoke(start)

@cli.command()
@click.pass_context
def start(ctx):
    """Start the main program"""
    config = Config(ctx.obj["data_dir"])
    config.validate()
    main.main(config, ctx.obj["debug"], ctx.obj["http_tracing"])


@cli.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="API bind address")
@click.option("--port", default=8000, show_default=True, type=int, help="API bind port")
@click.pass_context
def api(ctx, host, port):
    """Start the Litestar-based configuration API"""
    from .api_app import create_app

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - should never happen if deps installed
        raise RuntimeError("uvicorn is required to run the API server") from exc

    data_dir = ctx.obj["data_dir"]
    app = create_app(data_dir, debug=ctx.obj["debug"])
    uvicorn.run(app, host=host, port=port)


# Create fake "self" group to show pyapp options in help menu
# Subcommands remove, restore, update
pyapp_group = click.RichGroup("self", help="pyapp options (update, remove, restore)")
pyapp_group.add_command(
    click.RichCommand("update", help="Update the package to the latest version")
)
pyapp_group.add_command(
    click.Command("remove", help="Remove the package, wiping the installation but not the data")
)
pyapp_group.add_command(
    click.RichCommand(
        "restore", help="Restore the package to its original state by reinstalling it"
    )
)
if os.getenv("PYAPP"):
    cli.add_command(pyapp_group)


def app_start():
    cli(obj={})
