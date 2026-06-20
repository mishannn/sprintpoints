# Sprint Points

Sprint Points is a realtime-style planning poker app for agile teams. Create a room, invite teammates with a link, vote privately, reveal estimates together, and keep the story queue visible during refinement or sprint planning.

The app now uses a React/Vite frontend and a FastAPI backend backed by PostgreSQL in Docker Compose.

## Tech Stack

- Frontend: React, TypeScript, Vite
- UI: Mantine, lucide-react icons
- Backend: FastAPI, SQLAlchemy, PostgreSQL
- Python package manager: uv

## Requirements

- Node.js 24+
- npm 11+
- Python 3.12+
- uv
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

Start Docker Compose:

```bash
docker compose up -d --build
```

This starts:

- `caddy`: public HTTPS reverse proxy on ports `80` and `443`
- `db`: PostgreSQL 17 with a persistent Docker volume
- `backend`: FastAPI behind `https://sprintpoints.<your-domain>`
- `db-admin`: pgAdmin behind `https://admin.<your-domain>`

Health check:

```bash
curl https://sprintpoints.<your-domain>/api/health
```

The backend creates its database tables on startup. There are no copied legacy migrations.

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

Install backend dependencies:

```bash
uv sync
```

For local backend development without Docker, provide a database URL and start FastAPI:

```bash
export DATABASE_URL=sqlite+pysqlite:///./planningpoker.sqlite3
uv run uvicorn backend.app.main:app --reload
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
| `DATABASE_URL` | No | SQLAlchemy database URL. Compose sets this to PostgreSQL. Local default is SQLite. |
| `PLANNING_POKER_CORS_ORIGINS` | No | Comma-separated allowed browser origins. Defaults to `*`. |
| `BASE_DOMAIN` | Yes for Compose | Base domain used by Caddy. `sprintpoints` and `admin` subdomains are created from it. |
| `POSTGRES_DB` | Yes for Compose | PostgreSQL database name. |
| `POSTGRES_USER` | Yes for Compose | PostgreSQL username. |
| `POSTGRES_PASSWORD` | Yes for Compose | PostgreSQL password. |
| `PGADMIN_DEFAULT_EMAIL` | Yes for Compose | pgAdmin login email. |
| `PGADMIN_DEFAULT_PASSWORD` | Yes for Compose | pgAdmin login password. |

## Backend

The backend is split into settings, database setup, SQLAlchemy models, request schemas, service helpers, and routers.

Main tables:

- `rooms`: room metadata, card set, reveal state, active story, host token
- `participants`: room members, spectator flag, heartbeat timestamp, participant token
- `issues`: story queue, descriptions, links, order, final estimates, archive timestamps
- `votes`: one vote per participant per story

## Security Model

Room codes are invite links. Joining by code creates a participant token.

Room state and all room-scoped mutations require a token that belongs to that same room:

- A participant token can load that room, update that participant, heartbeat, and vote as that participant.
- A host token can load that room as host and run facilitator actions such as reveal, reset, story management, estimates, and participant removal.
- A participant token from one room cannot read issues from another room.
- Tokens are not exposed to other participants in room state.

This is an anonymous invite-link model, not account-based workspace authentication.

## Development Commands

```bash
uv run uvicorn backend.app.main:app --reload
```

Runs the FastAPI backend from the project root.

```bash
uv run pytest
```

Runs backend tests.

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
│   ├── app/
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── routers/
│   │   ├── schemas.py
│   │   ├── services.py
│   │   └── settings.py
│   └── tests/
│       └── test_security.py
├── src/
│   ├── app/
│   ├── entities/
│   ├── features/
│   ├── pages/
│   ├── shared/
│   └── widgets/
├── .env.example
├── package.json
├── pyproject.toml
└── vite.config.ts
```

## License

MIT
