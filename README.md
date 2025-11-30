# SponsorBlockTV Web

[![ghcr.io Pulls](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fipitio.github.io%2Fbackage%2Fdmunozv04%2FSponsorBlockTV-Web%2Fsponsorblocktv-web.json&query=downloads&logo=github&label=ghcr.io%20pulls&style=flat)](https://ghcr.io/dmunozv04/sponsorblocktv-web)
[![Docker Pulls](https://img.shields.io/docker/pulls/dmunozv04/sponsorblocktv-web?logo=docker&style=flat)](https://hub.docker.com/r/dmunozv04/sponsorblocktv-web/)
[![GitHub Release](https://img.shields.io/github/v/release/dmunozv04/sponsorblocktv-web?logo=GitHub&style=flat)](https://github.com/dmunozv04/SponsorBlockTV-Web/releases/latest)
[![GitHub Repo stars](https://img.shields.io/github/stars/dmunozv04/sponsorblocktv-web?style=flat)](https://github.com/dmunozv04/SponsorBlockTV-Web)

SponsorBlockTV Web is a self-hosted companion for YouTube TV clients. It pairs with your TV app and automatically
skips SponsorBlock segments (sponsors, intros, self-promo, etc.), presses "Skip Ad" as soon as possible, and can mute
ads entirely. Everything runs locally with SponsorBlock data fetched from the public API.

## Installation

See the [wiki](https://github.com/dmunozv04/SponsorBlockTV-Web/wiki/Installation) for Docker, bare-metal, and NAS
instructions. The snippets below cover the two most common container workflows.

### Docker Compose Quick Start

The repository ships with a ready-to-use `docker-compose.yml`. Clone the repo, tweak the environment block to match your
credentials (at minimum set `SBTV_AUTH_USERNAME`, `SBTV_AUTH_PASSWORD`, and `SBTV_JWT_SECRET`), then run:

```bash
docker compose up -d            # use --build if you changed the source
```

Useful notes:

- `network_mode: host` is enabled to allow SSDP discovery. It works on Linux; remove that line and add
  `ports: ["8000:8000"]` if you are on macOS/Windows or do not need multicast discovery.
- Configuration lives in the named volume `sbtv_data`. Replace it with a bind mount
  (e.g., `- ./data:/app/data`) if you want the files on the host filesystem.
- Expose port `8000` (or `SBTV_API_PORT`) through your reverse proxy to reach both the UI (`/`) and API (`/api`).

### Plain Docker Run

To run directly from the published image without Compose:

```bash
docker run -d \
  --name sponsorblocktv-web \
  --restart unless-stopped \
  --network host \  # or -p 8000:8000 on macOS/Windows
  -v "$(pwd)/data:/app/data" \
  -e SBTV_AUTH_USERNAME=admin \
  -e SBTV_AUTH_PASSWORD=supersecret \
  -e SBTV_JWT_SECRET=change-me \
  ghcr.io/dmunozv04/sponsorblocktv-web:latest
```

Swap `--network host` for `-p 8000:8000` if host networking is unavailable. Any additional environment variables from
the table below can be appended with `-e`. Once the container is running, open `http://<host>:8000/` to access the
dashboard.

## Device Compatibility

Legend: ✅ working, ❌ not working, ❔ untested. Create an issue if your device is missing.

| Device             | Status |
|:-------------------|:------:|
| Apple TV           |   ✅*   |
| Samsung TV (Tizen) |   ✅    |
| LG TV (webOS)      |   ✅    |
| Android TV         |   ✅    |
| Chromecast         |   ✅    |
| Google TV          |   ✅    |
| Roku               |   ✅    |
| Fire TV            |   ✅    |
| CCwGTV             |   ✅    |
| Nintendo Switch    |   ✅    |
| Xbox One/Series    |   ✅    |
| PlayStation 4/5    |   ✅    |

*Ad muting cannot work while AirPlay routes audio to another speaker.

## Usage

Run SponsorBlockTV Web on any machine with outbound internet access (only YouTube is required). Device discovery during
setup works best when the host shares the same LAN as the TV, but you can always pair manually with a YouTube TV code
from the app's settings.

### Web UI

When the service is running, open `http://<host>/` to reach the React dashboard. All API calls originate from the same
origin and target `/api/...`, so you only need a single exposed port.

### Configuration API

SponsorBlockTV Web ships with a Litestar-based API that mirrors the Textual setup wizard. Launch it via:

```bash
sponsorblocktv-web --data /path/to/data api --host 127.0.0.1 --port 8000
```

Key endpoints (all under `/api`):

- `GET /api/config` / `PATCH /api/config` — inspect and update global settings (API key, autoplay, skip categories, etc.)
- `GET /api/skip-categories/options` — list all SponsorBlock categories
- `GET /api/devices`, `POST /api/devices`, `PUT /api/devices/{screen_id}`, `DELETE /api/devices/{screen_id}` — manage linked devices
- `GET /api/devices/discover`, `POST /api/devices/pair` — automatically find devices or pair with a TV code
- `GET /api/channels`, `POST /api/channels`, `DELETE /api/channels/{channel_id}` — maintain the channel whitelist
- `GET /api/channels/search?query=…` — search YouTube channels (requires an API key)

By default the API binds to localhost; use the global `--data` option if your config lives elsewhere.

**Docker note:** The container now serves both the automation service and the React UI. Expose port `8000`
(`-p 80:8000` if you want the UI on port 80) and the SPA will be available at `/`, with the API under `/api/...`.

### Environment Variables

| Variable                | Default | Purpose                                                                 |
|-------------------------|---------|-------------------------------------------------------------------------|
| `SBTV_DATA_DIR`         | `data`  | Path where the SQLite config database (`config.db`) and data files live |
| `SBTV_DOCKER`           | `False` | Automatically suppress interactive prompts when the data dir is missing |
| `SBTV_ENABLE_SERVICE`   | `True`  | Enable the core SponsorBlockTV Web loop inside the container runner     |
| `SBTV_ENABLE_API`       | `True`  | Enable the Litestar configuration API                                   |
| `SBTV_API_HOST`         | `0.0.0.0` | API bind address                                                      |
| `SBTV_API_PORT`         | `8000`  | API TCP port                                                            |
| `SBTV_DEBUG`            | `False` | Enable verbose logging for both service and API                         |
| `SBTV_HTTP_TRACING`     | `False` | Emit aiohttp tracing logs (service only)                                |
| `SBTV_AUTH_USERNAME`    | `admin` | Username for JWT authentication                                         |
| `SBTV_AUTH_PASSWORD`    | `admin` | Password for JWT authentication                                         |
| `SBTV_JWT_SECRET`       | `change-me` | Symmetric secret used to sign JWTs                                  |
| `SBTV_JWT_EXPIRES_SECONDS` | `3600` | Lifetime (seconds) for issued tokens                                 |
| `SBTV_ENABLE_DOCS`      | `False` | Expose `/docs` and `/api/schema` (Swagger UI + OpenAPI JSON)            |
| `SBTV_FRONTEND_DIST`    | unset   | Absolute path to the built React SPA (Docker image sets `/app/frontend`) |

When running outside Docker, build the UI manually:

```bash
cd src/frontend
pnpm install
pnpm build
export SBTV_FRONTEND_DIST="$(pwd)/dist"
sponsorblocktv-web --data ./data api
```

### Authentication

All API endpoints under `/api` (except `POST /api/auth/login`) require a JWT bearer token.

1. Configure `SBTV_AUTH_USERNAME`, `SBTV_AUTH_PASSWORD`, and `SBTV_JWT_SECRET` (defaults are insecure; override them).
2. Call `POST /api/auth/login` with `{"username": "...", "password": "..."}` to obtain a token.
3. Send `Authorization: Bearer <token>` with every request.
4. Tokens expire after `SBTV_JWT_EXPIRES_SECONDS` (default 3600) and must be refreshed.

When documentation is enabled (`SBTV_ENABLE_DOCS=1`), the Swagger UI is world-readable but still requires a token for
API calls. Use the helper form above the UI to fetch and auto-apply a token, or paste an existing token via the
"Authorize" button.

## Libraries Used

- [pyytlounge](https://github.com/FabioGNR/pyytlounge) — YouTube TV lounge pairing
- [aiohttp](https://github.com/aio-libs/aiohttp) — async HTTP client
- [async-cache](https://github.com/iamsinghrajat/async-cache)
- [Textual](https://github.com/textualize/textual/) — setup wizard UI
- [ssdp](https://github.com/codingjoe/ssdp) — LAN device discovery

## Projects Using SponsorBlockTV Web

- [Home Assistant Addon](https://github.com/bertybuttface/addons/tree/main/sponsorblocktv-web)

## Contributing

1. Fork it (<https://github.com/dmunozv04/SponsorBlockTV-Web/fork>)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

## Contributors

[![Contributors](https://contrib.rocks/image?repo=dmunozv04/SponsorBlockTV-Web)](https://github.com/dmunozv04/SponsorBlockTV-Web/graphs/contributors)

Made with [contrib.rocks](https://contrib.rocks).

## License

[![GNU GPLv3](https://www.gnu.org/graphics/gplv3-127x51.png)](https://www.gnu.org/licenses/gpl-3.0.en.html)
