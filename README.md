# Sprint Points

Sprint Points is a realtime planning poker app for agile teams. Create a room, invite teammates with a link, vote privately, reveal estimates together, and keep the story queue visible during refinement or sprint planning. Room changes are pushed to every participant over a WebSocket connection.

The app uses a React/Vite frontend and a PostgreSQL-backed API in Docker Compose. The API is available as the original Go backend and as an API-compatible NestJS backend; both also support SQLite for local development and tests.

## Features

- **Realtime rooms** — participants, stories, votes, and estimates sync instantly over WebSocket.
- **Private voting** — everyone votes with a shared card deck; results stay hidden until the facilitator reveals them.
- **Session story queue** — a compact sidebar list for switching the active story, with quick search and one-click archiving.
- **Full-screen story management** — expand the queue into a focused workspace with add/edit, search, bulk selection, bulk archiving, and deletion.
- **Host bulk cleanup** — select all visible stories or only estimated/not estimated ones, then archive or delete them together.
- **Host duplicate detection** — choose whether duplicates are matched by link or by title, preview flagged copies, and remove extras in one action. The best copy is kept: an estimated story first, then the active story, then the earliest one.
- **CSV import and export** — import Jira CSV exports with column mapping and export the current queue as CSV.
- **Participant controls** — spectator mode, host ownership transfer, and participant removal.
- **Bilingual interface** — English and Russian.

## Screenshots

<img src="screenshots/home.png" width="800" alt="Lobby with create and join room forms">

<img src="screenshots/room-voting.png" width="800" alt="Room with the story queue, voting deck, and hidden votes">

<img src="screenshots/room-voted.png" width="800" alt="Room with revealed votes, average, range, and per-person estimates">

<img src="screenshots/story-management.png" width="800" alt="Full-screen story management with search, bulk selection, dedupe, and archive actions">

<img src="screenshots/csv-import.png" width="800" alt="CSV import with column mapping and a preview of stories to import">

## Tech Stack

- Frontend: React, TypeScript, Vite
- UI: Mantine, lucide-react icons
- Backend: Go 1.24 (Gin, GORM, Gorilla WebSocket) or NestJS 12 (TypeORM, class-validator, ws), with SQLite/PostgreSQL

## Requirements

- Node.js 24+
- npm 11+
- Go 1.24+ and a C compiler (SQLite uses CGO) only when running the Go backend
- Docker and Docker Compose for VPS deployment

## Production Start On A VPS

Create DNS `A` records for both application hostnames pointing at the VPS:

- `sprintpoints.<your-domain>`
- `admin.<your-domain>`

Then clone the repository, create `.env`, and start the stack from the project root:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `BASE_DOMAIN`
- `POSTGRES_PASSWORD`
- `PGADMIN_DEFAULT_EMAIL`
- `PGADMIN_DEFAULT_PASSWORD`

For a new installation, start Docker Compose:

```bash
docker compose up -d --build
```

The Go backend creates its isolated schema and applies versioned SQL migrations through Goose before accepting requests. The NestJS backend creates and migrates its own isolated schema with TypeORM. Caddy serves whichever backend `BACKEND_UPSTREAM` names; the default remains `backend:8000` (Go). For an existing installation, follow the transfer procedures below.

This starts:

- `caddy`: public HTTPS reverse proxy on ports `80` and `443`
- `db`: PostgreSQL 17 with a persistent Docker volume
- `backend`: Go API on internal port `8000`
- `backend-nest`: NestJS API on internal port `8000`
- `db-admin`: pgAdmin behind `https://admin.<your-domain>`

Only the backend selected by `BACKEND_UPSTREAM` is reachable through Caddy.

Health check:

```bash
curl https://sprintpoints.<your-domain>/api/health
```

Schema migrations are automatic; transfer of legacy data is a separate one-shot operation (manual for the Go backend, scripted for the NestJS cutover). The Go backend does not read or copy data from `public` or use Alembic.

## Transfer an existing PostgreSQL database

The old application tables are in `public`; the Go backend uses `sprintpoints`. Goose creates the target tables and tracks schema versions. The transfer script is one SQL `DO` statement that copies all four tables into an empty, prepared target and checks consistency atomically. Room links, IDs, tokens and timestamps are preserved. It leaves `public`, its Alembic metadata and the target's Goose migration history untouched. Invalid source data or a nonempty target aborts the operation.

1. Stop the old backend and take a backup:

```bash
docker compose stop backend
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > before-sprintpoints.sql
```

2. Set `DATABASE_SCHEMA=sprintpoints` in `.env`. If overriding `DATABASE_URL`, use a standard `postgres://` or `postgresql://` URL. Build the Go backend and apply only schema migrations, without opening HTTP:

```bash
docker compose build backend
docker compose run --rm --no-deps backend /app/server -migrate
```

3. Run the transfer once, either in pgAdmin's Query Tool or with:

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ops/database/migrate-from-public.sql
```

4. Start the backend:

```bash
docker compose up -d backend
curl https://sprintpoints.<your-domain>/api/health
```

Check an existing room with its saved host/participant credentials. Keep the old schema and backup until the new deployment has been verified. To roll back before accepting new writes, stop the new backend and restore the previous backend image/configuration pointing at `public`. Once new writes have occurred, restoring the old backend requires a separate data reconciliation; the old schema is only a snapshot.

## Move to the NestJS backend

`backend-nest` is an API-compatible NestJS implementation. It keeps the same routes, headers, status codes, JSON field names, WebSocket event and error body (`{"detail": "..."}`), while using Nest modules, DTO validation and TypeORM internally. It uses its own PostgreSQL schema (`sprintpoints_nest` by default) and its own `nestjs_migrations` ledger.

The one-shot cutover script stops the old backend, takes a full backup, builds NestJS, migrates the new schema, copies the current data atomically, starts NestJS and points Caddy at it:

```bash
chmod +x ops/deploy-nestjs.sh   # once
./ops/deploy-nestjs.sh
```

It reads `.env` and defaults to:

- source schema `sprintpoints` (the Go backend's schema);
- target schema `sprintpoints_nest` (the NestJS backend's schema);
- backup file `backup-before-nestjs-<UTC timestamp>.sql`.

Override non-default schemas with `SOURCE_SCHEMA` and `TARGET_SCHEMA`:

```bash
SOURCE_SCHEMA=public TARGET_SCHEMA=sprintpoints_nest ./ops/deploy-nestjs.sh
```

If you override the target schema, persist `NEST_DATABASE_SCHEMA=<target>` and `BACKEND_UPSTREAM=backend-nest:8000` in `.env` so later `docker compose up` runs keep the cutover.

The data transfer is a single transaction in [ops/database/migrate-to-nestjs.sql](ops/database/migrate-to-nestjs.sql). It refuses a nonempty target, invalid or cross-room source data, and validates every copied row before committing. IDs, room codes, host/participant tokens, card sets and timestamps are preserved. The source schema and its migration metadata are untouched.

If the script fails, it restarts the old backend behind Caddy. After a successful cutover, the Go container is stopped but retained. Roll back before accepting new writes:

```bash
BACKEND_UPSTREAM=backend:8000 docker compose up -d caddy --no-deps --force-recreate
docker compose up -d backend
```

Once NestJS has accepted new writes, rolling back to Go requires a separate data reconciliation; the Go schema is only a snapshot.

## Database Admin UI

Docker Compose includes pgAdmin with a preconfigured login and a preconfigured connection to the app database.

Open:

```text
https://admin.<your-domain>
```

Sign in with the credentials from `.env`:

| Field | Value |
| --- | --- |
| Email | `PGADMIN_DEFAULT_EMAIL` |
| Password | `PGADMIN_DEFAULT_PASSWORD` |

The server named `Planning Poker` is imported automatically from `docker/pgadmin/servers.json`. Its database passfile is generated from the Postgres environment variables when the pgAdmin container starts, so users should not need to configure the database connection manually.

pgAdmin stores its own UI metadata in the `pgadmin_data` Docker volume. The app data stays in the `postgres_data` volume.
Caddy stores ACME certificates in the `caddy_data` Docker volume and issues certificates automatically when the DNS records resolve to the VPS.

## Local Development

Install frontend dependencies:

```bash
npm install
```

Run the Go backend locally (Go modules are resolved from `go.mod`):

```bash
export DATABASE_URL=sqlite:///./sprintpoints.sqlite3
go run ./backend/cmd/server
```

Or run the NestJS backend locally:

```bash
cd backend-nest
npm install
DATABASE_URL=sqlite:///./sprintpoints-nest.sqlite3 npm run start:dev
```

In another terminal, start the frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

Vite proxies `/api` to `http://127.0.0.1:8000` during development.

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `VITE_API_URL` | No | Frontend API base URL. Defaults to `/api`. |
| `VITE_BASE_PATH` | No | Override Vite base path, useful for custom domains. |
| `DATABASE_URL` | No | PostgreSQL (`postgres://` / `postgresql://`) or SQLite (`sqlite:///`) URL. Compose configures PostgreSQL from `POSTGRES_*`. Defaults to `sqlite:///./sprintpoints.sqlite3`. |
| `DATABASE_SCHEMA` | No | PostgreSQL schema created and migrated by the backend; default `sprintpoints` for Go and `sprintpoints_nest` for NestJS. A single URL `search_path` takes precedence. |
| `NEST_DATABASE_SCHEMA` | No | NestJS schema used by Docker Compose; default `sprintpoints_nest`. |
| `BACKEND_UPSTREAM` | No | Caddy upstream; default `backend:8000` (Go). Use `backend-nest:8000` after cutover. |
| `SOURCE_SCHEMA` | No | Source schema for `ops/deploy-nestjs.sh`; default `sprintpoints`. |
| `TARGET_SCHEMA` | No | Target schema for `ops/deploy-nestjs.sh`; default `sprintpoints_nest`. |
| `LISTEN_ADDR` | No | HTTP listen address, default `:8000`. |
| `PLANNING_POKER_CORS_ORIGINS` | No | Comma-separated allowed browser origins. Defaults to `*`. |
| `BASE_DOMAIN` | Yes for Compose | Base domain used by Caddy. `sprintpoints` and `admin` subdomains are created from it. |
| `POSTGRES_DB` | Yes for Compose | PostgreSQL database name. |
| `POSTGRES_USER` | Yes for Compose | PostgreSQL username. |
| `POSTGRES_PASSWORD` | Yes for Compose | PostgreSQL password. |
| `PGADMIN_DEFAULT_EMAIL` | Yes for Compose | pgAdmin login email. |
| `PGADMIN_DEFAULT_PASSWORD` | Yes for Compose | pgAdmin login password. |

## Backend

The Go backend separates domain entities, HTTP handlers, persistence and realtime notifications. See [backend/README.md](backend/README.md) for package responsibilities and request flow. The NestJS backend lives in [backend-nest](backend-nest/README.md) and implements the same API with Nest modules, DTO validation, TypeORM and a plain WebSocket hub. SQLite and PostgreSQL share each backend's domain models and API contract.

Main tables:

- `rooms`: room metadata, card set, reveal state, active story, host token
- `participants`: room members, spectator flag, heartbeat timestamp, participant token
- `issues`: story queue, descriptions, links, order, final estimates, archive timestamps
- `votes`: one vote per participant per story

## Security Model

Room codes are invite links. Joining by code creates a participant token.

Room state and all room-scoped mutations require a token that belongs to that same room:

- A participant token can load that room, update that participant, heartbeat, vote as that participant, and subscribe to that room's WebSocket update stream (`/api/rooms/{room_id}/ws`, token passed as a query parameter).
- A host token can load that room as host and run facilitator actions such as reveal, reset, story management, estimates, and participant removal.
- A participant token from one room cannot read issues from another room.
- Tokens are not exposed to other participants in room state.

This is an anonymous invite-link model, not account-based workspace authentication.

## Development Commands

```bash
go run ./backend/cmd/server
```

Runs the Go API locally. The backend uses `DATABASE_URL` when set; otherwise it uses its local SQLite default.

```bash
go test -race ./...
go vet ./...
```

Runs Go tests (including PostgreSQL integration tests when `TEST_POSTGRES_URL` is set) and static checks. CI runs these with a PostgreSQL service.

Go integration tests cover HTTP behavior, authentication, token privacy, ownership transfer, voting, WebSocket notifications, persisted data schema migrations and manually executed data transfer SQL. `/openapi.json`, `/docs`, and `/redoc` retain the original API documentation. WebSocket notifications use an in-process registry, so run one backend instance (as in the existing Compose deployment).

```bash
cd backend-nest
npm test
npm run build
```

Runs the NestJS API/WebSocket tests against temporary SQLite databases and builds the production server. Set `TEST_POSTGRES_URL` and run `npm run test:postgres` from `backend-nest` to execute the PostgreSQL integration suite, including the data-transfer SQL. CI runs both suites with Node 24.

```bash
npm run dev
```

Runs the local frontend development server.

```bash
npm run build
```

Type-checks and builds the production frontend into `dist`.

```bash
npm run preview
```

Serves the production frontend build locally.

## Project Structure

```text
.
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── cmd/server/
│   ├── README.md           # Architecture and request flow
│   └── internal/
│       ├── domain/         # Rooms, participants, issues, votes
│       ├── httpapi/        # Routes and handlers grouped by feature
│       ├── storage/        # Database connections and versioned SQL migrations
│       └── realtime/       # Room WebSocket subscriptions and broadcasts
├── backend-nest/
│   ├── Dockerfile
│   ├── README.md           # NestJS architecture and compatibility notes
│   ├── src/
│   │   ├── common/         # DTOs, errors, validation, CORS
│   │   ├── database/       # TypeORM entities, migrations, transactions
│   │   ├── realtime/       # Process-local WebSocket room hub
│   │   ├── rooms/          # Feature modules and controllers
│   │   ├── participants/
│   │   ├── issues/
│   │   └── votes/
│   └── test/               # API, WebSocket, persistence and migration tests
├── ops/
│   ├── database/           # Manual data transfer SQL
│   └── deploy-nestjs.sh    # One-shot NestJS cutover
├── src/
│   ├── app/
│   ├── entities/
│   ├── features/
│   ├── pages/
│   ├── shared/
│   └── widgets/
├── .env.example
├── package.json
├── go.mod
└── vite.config.ts
```

## License

MIT
