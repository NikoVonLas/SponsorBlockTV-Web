# SponsorBlockTV Web

[![ghcr.io Pulls][badge-ghcr]][link-ghcr]
[![Docker Pulls][badge-docker]][link-docker]
[![GitHub Release][badge-release]][link-release]

| ![login][screen-login] | ![devices][screen-devices]                                                                           |
| --- |------------------------------------------------------------------------------------------------------|
| ![whitelist][screen-whitelist] | ![config][screen-config] |

SponsorBlockTV Web is a self-hosted companion for YouTube TV clients. It pairs
with your TV app and automatically skips SponsorBlock segments (sponsors,
intros, self-promo, etc.), presses "Skip Ad" as soon as possible, and can mute
ads entirely. Everything runs locally with SponsorBlock data fetched from the
public API.

This repository is a fork of
[iSponsorBlockTV](https://github.com/dmunozv04/iSponsorBlockTV) that adds a
built-in web panel.

## Installation

### Docker Compose Quick Start

The repository ships with a ready-to-use `docker-compose.yml`. Clone the repo,
update the environment block (at minimum set `SBTV_AUTH_USERNAME`,
`SBTV_AUTH_PASSWORD`, and `SBTV_JWT_SECRET`), then run:

```bash
docker compose up -d        # add --build if you changed the source
```

Notes:

- The compose file defaults to `network_mode: host` so SSDP discovery works. On
  macOS/Windows (or if you don’t need multicast) remove that line and add
  `ports: ["80:80"]`.
- Configuration lives in the `sbtv_data` named volume. Swap it for a bind mount
  (e.g., `- ./data:/app/data`) if you want files on the host filesystem.

### Plain Docker Run

To run directly from the published image without Compose:

```bash
docker run -d \
  --name sponsorblocktv-web \
  --restart unless-stopped \
  --network host \
  -v "$(pwd)/data:/app/data" \
  -e SBTV_AUTH_USERNAME=admin \
  -e SBTV_AUTH_PASSWORD=supersecret \
  -e SBTV_JWT_SECRET=change-me \
  ghcr.io/nikovonlas/sponsorblocktv-web:latest
```

Use `-p 80:80` instead of `--network host` if host networking is
unavailable.

### Environment Variables

<!-- markdownlint-disable MD013 -->
| Variable | Default | Purpose |
| --- | --- | --- |
| `SBTV_DATA_DIR` | `data` | Directory that stores `config.db` and related files. |
| `SBTV_DOCKER` | `False` | Suppress interactive prompts when the data directory is missing. |
| `SBTV_ENABLE_SERVICE` / `SBTV_ENABLE_API` | `True` | Toggle the automation loop or API server when running inside Docker. |
| `SBTV_API_HOST` / `SBTV_API_PORT` | `0.0.0.0` / `80` | Bind address and port for the API. |
| `SBTV_DEBUG` / `SBTV_HTTP_TRACING` | `False` | Enable verbose logging or aiohttp request tracing. |
| `SBTV_AUTH_USERNAME` / `SBTV_AUTH_PASSWORD` | `admin` | Credentials for `POST /api/auth/login`. |
| `SBTV_JWT_SECRET` | `change-me` | Symmetric key for JWT signing. |
| `SBTV_JWT_EXPIRES_SECONDS` | `3600` | Lifetime (seconds) for issued tokens. |
| `SBTV_ENABLE_DOCS` | `False` | Expose `/docs` and `/api/schema`. |
| `SBTV_FRONTEND_DIST` | unset | Absolute path to the built React SPA when running outside Docker. |
<!-- markdownlint-enable MD013 -->

** Shorts aren't fully supported due to limitations on YouTube's side.
A single short can be seen by either selecting the "Disconnect" option in the
 warning shown
or by long pressing the thumbnail to open the menu and clicking play from there

## Usage

Run SponsorBlockTV Web on any machine with outbound internet access (only
YouTube is required). Device discovery works best when the host shares the same
LAN as the TV, but you can always pair manually with a YouTube TV code from the
YouTube TV device settings.

### Web UI

When the service is running, open `http://<host>/` to reach the React dashboard.
All API calls originate from the same origin and target `/api/...`, so you only
need a single exposed port.

### Statistics

The **Stats** tab (and the `/api/stats` endpoint) exposes aggregate viewing
metrics: videos started, total watch time, number of skipped segments, and the
time saved by SponsorBlock jumps. Select a device to drill down or keep the
global view for overall totals.

### CLI & API

The packaged CLI (`sponsorblocktv-web`) exposes the same configuration controls
as the REST API. Useful commands:

```bash
sponsorblocktv-web --data ./data start          # run automation service
sponsorblocktv-web --data ./data api            # run Litestar API (default 80)
sponsorblocktv-web --help                       # see all CLI flags/options
```

## Known Limitations

- Ad muting cannot work while AirPlay routes audio to another speaker.
- SSDP discovery requires host networking (Linux).
Use manual pairing or exposed ports on macOS/Windows.

## Libraries Used

- [pyytlounge][lib-pyytlounge] — YouTube TV lounge pairing
- [aiohttp][lib-aiohttp] — async HTTP client
- [async-cache][lib-async-cache] — simple async memoization
- [ssdp][lib-ssdp] — LAN device discovery
- [xmltodict][lib-xmltodict] — lightweight XML → dict parsing
- [Litestar][lib-litestar] — REST API framework
- [Uvicorn][lib-uvicorn] — ASGI server used for the API
- [Pydantic][lib-pydantic] — request/response validation
- [PyJWT][lib-pyjwt] — JWT issuance & validation
- [rich][lib-rich] / [rich-click][lib-rich-click] — CLI UX
- [appdirs][lib-appdirs] — cross-platform data-dir resolution

## Contributing

1. Fork it (<https://github.com/NikoVonLas/SponsorBlockTV-Web/fork>)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

## Contributors

[![Contributors](https://contrib.rocks/image?repo=NikoVonLas/SponsorBlockTV-Web)](https://github.com/NikoVonLas/SponsorBlockTV-Web/graphs/contributors)

## License

[![GNU GPLv3](https://www.gnu.org/graphics/gplv3-127x51.png)](https://www.gnu.org/licenses/gpl-3.0.en.html)

<!-- markdownlint-disable MD013 -->
[badge-ghcr]: https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fipitio.github.io%2Fbackage%2FNikoVonLas%2FSponsorBlockTV-Web%2Fsponsorblocktv-web.json&query=downloads&logo=github&label=ghcr.io%20pulls&style=flat
[badge-docker]: https://img.shields.io/docker/pulls/nikovonlas/sponsorblocktv-web?logo=docker&style=flat
[badge-release]: https://img.shields.io/github/v/release/NikoVonLas/SponsorBlockTV-Web?logo=GitHub&style=flat
[link-ghcr]: https://ghcr.io/NikoVonLas/sponsorblocktv-web
[link-docker]: https://hub.docker.com/r/nikovonlas/sponsorblocktv-web/
[link-release]: https://github.com/NikoVonLas/SponsorBlockTV-Web/releases/latest
[lib-pyytlounge]: https://github.com/FabioGNR/pyytlounge
[lib-aiohttp]: https://github.com/aio-libs/aiohttp
[lib-async-cache]: https://github.com/iamsinghrajat/async-cache
[lib-ssdp]: https://github.com/codingjoe/ssdp
[lib-xmltodict]: https://github.com/martinblech/xmltodict
[lib-litestar]: https://litestar.dev/
[lib-uvicorn]: https://www.uvicorn.org/
[lib-pydantic]: https://docs.pydantic.dev/
[lib-pyjwt]: https://pyjwt.readthedocs.io/
[lib-rich]: https://github.com/Textualize/rich
[lib-rich-click]: https://github.com/ewels/rich-click
[lib-appdirs]: https://github.com/ActiveState/appdirs
[screen-login]: https://raw.githubusercontent.com/NikoVonLas/SponsorBlockTV-Web/refs/heads/main/screenshots/login.png
[screen-devices]: https://raw.githubusercontent.com/NikoVonLas/SponsorBlockTV-Web/refs/heads/main/screenshots/devices.png
[screen-whitelist]: https://raw.githubusercontent.com/NikoVonLas/SponsorBlockTV-Web/refs/heads/main/screenshots/whitelist.png
[screen-config]: https://raw.githubusercontent.com/NikoVonLas/SponsorBlockTV-Web/refs/heads/main/screenshots/config.png
<!-- markdownlint-enable MD013 -->
