# Repository Guidelines

## Project Structure & Module Organization
- Backend code now lives under `src/backend/sponsorblocktv_web/`. GUI setup is under `setup_wizard.py`, runtime logic in `main.py`, helper utilities in `helpers.py`, and the Litestar API in `api_app.py`.
- The React SPA frontend (JWT login + config UI) is located in `src/frontend/`.
- CLI entry points are in `src/backend/main.py` (wrapper) and `src/backend/sponsorblocktv_web/__main__.py`.
- Configuration templates reside in `config.json.template`; runtime configs now live in the SQLite database `data/config.db` (legacy `config.json` files are imported automatically).
- All API endpoints (except `GET /health`, `POST /auth/login`, `/docs`, and `/schema`) require JWT bearer tokens issued by `/auth/login`; credentials/secret come from the `SBTV_AUTH_*` environment variables.
- No dedicated test directory yet; create `tests/` for new automated coverage.

## Build, Test, and Development Commands
- `python3 -m venv .venv && source .venv/bin/activate` — create an isolated environment.
- `pip install -r requirements.txt` — install runtime and CLI dependencies.
- `PYTHONPATH=src/backend python3 src/backend/main.py` — run the wrapper entry point locally (Textual wizard lives in `src/backend/sponsorblocktv_web/setup_wizard.py`).
- `sponsorblocktv-web --data ./data start` — run the automation service.
- `sponsorblocktv-web --data ./data api --host 127.0.0.1 --port 8000` — expose the Litestar API for remote configuration.
- `python3 -m compileall src/backend` — quick syntax smoke check for modules.
- `cd src/frontend && pnpm dev` — launch the React SPA locally (requires Node 20 + pnpm).

## Coding Style & Naming Conventions
- Python 3.9+ codebase; follow standard Black/Ruff style (see `pyproject.toml` `line-length=100`).
- Use snake_case for functions/variables, PascalCase for classes, and UPPER_SNAKE for constants.
- Prefer type hints; keep imports grouped (stdlib, third-party, local).
- Minimize inline comments; add short context comments only for complex logic.

## Testing Guidelines
- No formal suite is present; add `pytest`-based tests under `tests/` with filenames like `test_module.py`.
- Cover async flows (API pairing, segment fetching) using `pytest.mark.asyncio`.
- When touching config logic, manually verify with `sponsorblocktv-web start` and `GET /api/config` on the API.

## Commit & Pull Request Guidelines
- Commit messages follow a concise, imperative style (e.g., `Add semver tags to docker build`).
- Keep changes scoped; separate dependency bumps from feature work.
- PRs should include: summary of changes, testing steps (manual/API commands), and links to related issues.
- Include screenshots or terminal snippets when altering user-facing CLI or Textual views.
