# syntax=docker/dockerfile:1
FROM python:3.12-alpine AS base

FROM base AS compiler

WORKDIR /app

COPY src/backend/ .

RUN python3 -m compileall -b -f . && \
    find . -name "*.py" -type f -delete

FROM base AS dep_installer

COPY requirements.txt .

RUN apk add --no-cache gcc musl-dev rust cargo && \
    pip install --upgrade pip wheel && \
    pip install -r requirements.txt && \
    pip uninstall -y pip wheel && \
    apk del gcc musl-dev rust cargo && \
    python3 -m compileall -b -f /usr/local/lib/python3.12/site-packages && \
    find /usr/local/lib/python3.12/site-packages -name "*.py" -type f -delete && \
    find /usr/local/lib/python3.12/ -name "__pycache__" -type d -exec rm -rf {} +

FROM node:20-alpine AS frontend_builder

WORKDIR /frontend

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY src/frontend/package.json src/frontend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY src/frontend .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm build

FROM base

ENV PIP_NO_CACHE_DIR=off SBTV_DOCKER=True SBTV_DATA_DIR=data TERM=xterm-256color COLORTERM=truecolor SBTV_FRONTEND_DIST=/app/frontend

COPY requirements.txt .

COPY --from=dep_installer /usr/local /usr/local

WORKDIR /app

COPY --from=compiler /app .
COPY --from=frontend_builder /frontend/dist /app/frontend

ENTRYPOINT ["python3", "-u", "-m", "sponsorblocktv_web.main"]
