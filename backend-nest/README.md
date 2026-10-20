# NestJS backend

The NestJS version of the Sprint Points API is an API-compatible replacement
for the Go backend. It uses Nest modules, controllers, DTO validation, TypeORM
repositories/transactions, exception filters and a plain WebSocket gateway
instead of translating Go/Gin/GORM patterns into TypeScript.

## API compatibility

All existing routes, headers, status codes, JSON field names and the single
`{"detail": "..."}` error body are preserved. This includes:

- `X-Host-Token` and `X-Participant-Token` credentials and token privacy;
- 422 responses for binding/validation failures, including required nullable
  `issueId` and `nextActiveIssueId` fields;
- `{"type":"room_updated"}` WebSocket notifications after commit;
- `/openapi.json`, `/docs`, `/redoc` and `/docs/oauth2-redirect`;
- `GET /api/health`, `-healthcheck` and `-migrate` process modes.

The API-facing behavior is compatible; the internal design is deliberately
different. Controllers stay thin, services own transactions, and database access
goes through TypeORM entities rather than raw query strings.

## Configuration

The same database environment variables are accepted:

| Name | Description |
| --- | --- |
| `DATABASE_URL` | `postgres://` / `postgresql://` or `sqlite:///` URL. |
| `POSTGRES_*` | Used to build a PostgreSQL URL when `DATABASE_URL` is absent. |
| `DATABASE_SCHEMA` | Isolated PostgreSQL schema. Defaults to `sprintpoints_nest`. |
| `LISTEN_ADDR` | Listen address, default `:8000`. |
| `PLANNING_POKER_CORS_ORIGINS` | Comma-separated origins; default `*`. |

The NestJS schema is **not** `sprintpoints` (the Go schema) and is not
`public`. It has its own `nestjs_migrations` ledger. Startup refuses to adopt
tables that lack that ledger.

## Local development

```bash
cd backend-nest
npm install
DATABASE_URL=sqlite:///./sprintpoints-nest.sqlite3 npm run start:dev
```

## Tests

```bash
cd backend-nest
npm test
```

Tests run against temporary SQLite databases. The PostgreSQL integration suite
runs when `TEST_POSTGRES_URL` is set:

```bash
TEST_POSTGRES_URL=postgres://user:pass@localhost:5432/db npm run test:postgres
```

It covers TypeORM startup migrations, the API against PostgreSQL, row locking,
and the one-shot `ops/database/migrate-to-nestjs.sql` import. CI supplies a
PostgreSQL 17 service.

## Production cutover

Do not point this backend at the `sprintpoints` schema. Use the one-shot
deployment script from the repository root:

```bash
./ops/deploy-nestjs.sh
```

It stops the old backend, backs up PostgreSQL, migrates the new schema, copies
data with `ops/database/migrate-to-nestjs.sql`, starts NestJS and switches
Caddy. See the root README for details and rollback.
