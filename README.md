# temp-uisks-backend

Временный backend на TypeScript (Clean Architecture) для `stivs-front-end`.

## Что внутри

- **2 базы данных**:
  - `APP_DB_*` — существующая основная БД проекта (**MySQL**, чтение аналитических данных)
  - `USERS_DB_*` — отдельная БД пользователей (**PostgreSQL**, поднимается через `docker-compose`)
- Проекты (`/api/projects`) читаются из таблицы `USERS_PROJECTS_TABLE` в `users_db`
- Аутентификация с ролями: `admin`, `staff`, `viewer`
- API по сущностям: `projects`, `employees`, `publications`, `finances`
- SQL-шаблоны (`sql_example`) используются как read-модель для основной БД

## Архитектура

- `src/domain` — сущности
- `src/application` — use-cases и порты
- `src/infrastructure` — реализации портов (Postgres/MySQL, SQL template reader, JWT/bcrypt)
- `src/api` — HTTP-роуты
- `src/shared` — конфиг, middleware, DB bootstrap

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

## Импорт `project.xlsx` в `users_db`

1. Убедитесь, что `users-db` поднят:

```bash
docker compose up -d users-db
```

2. В `.env` задайте таблицу проектов (по умолчанию `projects`):

```dotenv
USERS_PROJECTS_TABLE=projects
```

3. Загрузите Excel в PostgreSQL:

```bash
npm run import:projects:xlsx -- /absolute/path/to/project.xlsx --truncate
```

Опции:
- `--truncate` — очистить таблицу перед импортом
- `--sheet <имя_листа>` — импортировать конкретный лист (иначе берется первый)

После импорта API `GET /api/projects` читает данные из `users_db`.

## Swagger

- UI: `http://localhost:3000/docs` (редиректит на `/docs/`)
- JSON: `http://localhost:3000/docs-json`

## Быстрый smoke-тест запросов

```bash
./scripts/smoke-test.sh
```

Можно передать другой base URL:

```bash
./scripts/smoke-test.sh http://localhost:3000
```

## Контракт API

### Аутентификация / админ

- `POST /api/auth/login` `{email,password}` -> `{token, role, user}`
- `POST /api/auth/register` `{email,password,name,role?}` -> `{token, user}`
- `POST /api/auth/logout` (Bearer token)
- `GET /api/auth/me` -> `{user, role}`

### Проекты

- `GET /api/projects?status=&region=&q=&page=&limit=` -> `{ items, meta }`
- `GET /api/projects/:id`
- `POST /api/projects` (admin)
- `PATCH /api/projects/:id` (admin)
- `DELETE /api/projects/:id` (admin)

### Сотрудники

- `GET /api/employees?region=&q=&page=&limit=` -> `{ items, meta }`
- `GET /api/employees/:id`
- `POST /api/employees` (admin)
- `PATCH /api/employees/:id` (admin)
- `DELETE /api/employees/:id` (admin)

### Публикации

- `GET /api/publications?year=&type=&q=&page=&limit=` -> `{ items, meta }`
- `GET /api/publications/:id`
- `POST /api/publications` (admin)
- `PATCH /api/publications/:id` (admin)
- `DELETE /api/publications/:id` (admin)

### Финансы

- `GET /api/finances/summary?year=`
- `GET /api/finances/projects/:projectId`
- `POST /api/finances/projects/:projectId/history` (admin)
- `PATCH /api/finances/projects/:projectId/history` (admin)

## Временные ограничения текущей версии

- `projects` читаются из PostgreSQL (`users_db`), остальные домены пока из SQL-шаблонов и основной MySQL БД.
- Admin CRUD для проектов/сотрудников/публикаций реализован как **временный in-memory слой**, чтобы фронт работал по контракту до миграции на полноценные Go-сервисы и нормальные write-model таблицы.
