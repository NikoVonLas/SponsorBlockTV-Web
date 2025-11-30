# SponsorBlockTV Web — Frontend

React + TypeScript SPA для удалённой настройки SponsorBlockTV Web API. Проект собран на Vite, использует TailwindCSS, React Router и TanStack Query, поэтому полностью статичен и может быть задеплоен на любой CDN или за reverse-proxy самого backend. Docker-образ backend-а автоматически собирает этот bundle и раздаёт его по корневому пути.

## Возможности

- JWT-логин против `/auth/login`
- Просмотр/правка глобального конфига (`/config`)
- Управление skip categories (`/skip-categories/options`)
- CRUD по устройствам + pairing по PIN и сетевое Discovery (`/devices/*`)
- Управление whitelist'ом каналов, включая поиск по YouTube API (`/channels/*`)

## Быстрый старт

```bash
cd src/frontend
pnpm install
pnpm dev        # http://localhost:5173
```

Сборка production-артефактов:

```bash
pnpm build      # результат в dist/
pnpm preview    # локальный просмотр билда
```

## Конфигурация

- `VITE_API_BASE_URL` — базовый URL API (по умолчанию `/api`, то есть тот же хост, но другой префикс).
- Tailwind темы лежат в `tailwind.config.js`; цветовая схема синхронизирована с кастомным Swagger dark UI.

## Дальнейшие идеи

- Добавить нотификации/тосты вместо inline-сообщений
- Сохранение черновиков конфига перед массовыми апдейтами
- i18n (RU/EN)
