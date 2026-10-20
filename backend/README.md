# NestJS backend

Sprint Points uses this NestJS service as its API. It is built with Nest
modules, controllers, DTO validation, TypeORM repositories/transactions,
exception filters and a plain WebSocket hub.

## API contract

All frontend routes, headers, status codes, JSON field names and the
`{"detail": "..."}` error body are preserved. This includes:

- `X-Host-Token` and `X-Participant-Token` credentials and token privacy;
- 422 responses for binding/validation failures, including required nullable
  `issueId` and `nextActiveIssueId` fields;
- `{"type":"room_updated"}` WebSocket notifications after commit;
- `/openapi.json`, `/docs`, `/redoc` and `/docs/oauth2-redirect`;
- `GET /api/health`, `-healthcheck` and `-migrate` process modes.

Controllers stay thin, services own transactions, and database access goes
through TypeORM entities.

## Configuration

| Name | Description |
| --- | --- |
| `DATABASE_URL` | `postgres://` / `postgresql://` or `sqlite:///` URL. |
| `POSTGRES_*` | Used to build a PostgreSQL URL when `DATABASE_URL` is absent. |
| `DATABASE_SCHEMA` | Isolated PostgreSQL schema. Defaults to `sprintpoints_nest`. |
| `LISTEN_ADDR` | Listen address, default `:8000`. |
| `PLANNING_POKER_CORS_ORIGINS` | Comma-separated origins; default `*`. |

The schema is not `public` and has its own `nestjs_migrations` ledger. Startup
refuses to adopt tables that lack that ledger. Docker Compose passes its
`NEST_DATABASE_SCHEMA` value as `DATABASE_SCHEMA`.

## Local development

```bash
cd backend
npm install
DATABASE_URL=sqlite:///./sprintpoints-nest.sqlite3 npm run start:dev
```

## Tests

```bash
cd backend
npm test
```

Tests run against temporary SQLite databases. The PostgreSQL integration suite
runs when `TEST_POSTGRES_URL` is set:

```bash
TEST_POSTGRES_URL=postgres://user:pass@localhost:5432/db npm run test:postgres
```

It covers TypeORM startup migrations, the API against PostgreSQL, row locking,
and the legacy import in `ops/database/migrate-to-nestjs.sql`. CI supplies a
PostgreSQL 17 service.

## Container image

CI publishes the image to:

```text
ghcr.io/mishannn/sprintpoints-backend:latest
```

Tags are also published for git tags and as `sha-<commit>`. The package is made
public by the workflow when the token has permission to change package
visibility.

## Upgrading from the Go backend

An existing Go deployment keeps its data in `sprintpoints`. The new service uses
`sprintpoints_nest`. Back up, create the target schema, and run the transactional
import once before allowing users back in:

```bash
docker compose run --rm --no-deps -e DATABASE_SCHEMA=sprintpoints_nest \
  backend node dist/main.js -migrate
docker compose exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
   -v source_schema=sprintpoints -v target_schema=sprintpoints_nest' \
  < ops/database/migrate-to-nestjs.sql
```

See the root README for the full upgrade procedure.
