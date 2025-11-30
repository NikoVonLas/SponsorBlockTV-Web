# Repository Guidelines

## Project Structure & Module Organization
Backend sources live under `src/backend/sponsorblocktv_web/`, with `setup_wizard.py` for the Textual UI, `main.py` as the CLI wrapper, `helpers.py` for shared utilities, and `api_app.py` for the Litestar API. CLI entry points reside in `src/backend/main.py` and `src/backend/sponsorblocktv_web/__main__.py`. The React SPA (JWT login + configuration UI) is in `src/frontend/`. Runtime configuration is persisted in `data/config.db`; legacy `config.json` files import automatically via the startup flow. Place new automated tests in `tests/`.

## Build, Test, and Development Commands
Use `python3 -m venv .venv && source .venv/bin/activate` to bootstrap a local environment, then `pip install -r requirements.txt` for dependencies. Run the Textual setup wizard with `PYTHONPATH=src/backend python3 src/backend/main.py`. Start the automation service via `sponsorblocktv-web --data ./data start`, or expose the API with `sponsorblocktv-web --data ./data api --host 127.0.0.1 --port 8000`. Quickly sanity-check Python modules using `python3 -m compileall src/backend`. For the UI, `cd src/frontend && pnpm dev` (Node 20 + pnpm required).

## Coding Style & Naming Conventions
Target Python 3.9+ with Black/Ruff defaults (`line-length=100`). Keep imports grouped as stdlib, third-party, and local. Favor type hints, snake_case functions/variables, PascalCase classes, and UPPER_SNAKE constants. Default to ASCII unless a file already uses Unicode. Add succinct comments only where logic is non-obvious.

## Testing Guidelines
Adopt `pytest` with files under `tests/` named `test_*.py`. Use `pytest.mark.asyncio` for async API or segment-fetch flows. When modifying configuration logic, manually verify with `sponsorblocktv-web start` and `GET /api/config` against the API to ensure the SQLite-backed settings persist correctly.

## Commit & Pull Request Guidelines
Write imperative, terse commit messages (e.g., `Add semver tags to docker build`). Scope commits narrowly and avoid bundling dependency bumps with feature work. PRs should summarize changes, list manual/API testing commands, link related issues, and include screenshots or terminal snippets for any CLI/Textual UI updates.

## Security & Configuration Tips
All API routes except `GET /health`, `POST /auth/login`, `/docs`, and `/schema` require JWT bearer tokens issued by `/auth/login`. Credentials and secrets come from the `SBTV_AUTH_*` environment variables; keep them out of version control and sample them through `.env.example` style notes if needed. Configuration templates belong in `config.json.template`, while live data stays in `data/config.db`.
