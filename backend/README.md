# Backend architecture

`cmd/server/main.go` opens and migrates its database, starts HTTP, and handles health checks and graceful shutdown. Goose applies versioned SQL schema migrations before HTTP starts. `-migrate` applies them and exits without opening HTTP.

| Package | Responsibility | Entry points |
| --- | --- | --- |
| `internal/domain` | Room, participant, issue and vote models | Entity files |
| `internal/httpapi` | Gin routes, request binding, access checks and response presentation | `routes.go`, feature-specific `*_handlers.go`, `room_state.go` |
| `internal/storage` | GORM connections and Goose schema migrations | `database.go`, `migrations.go`, `migrations/` |
| `internal/realtime` | Gorilla WebSocket subscriptions and room broadcasts | `hub.go` |
| `../ops/database` | SQL run manually by the operator | `migrate-from-public.sql` |

Gin handles routing and JSON binding; gin-contrib/cors handles browser origins; validator checks request fields. GORM provides persistence and JSON serialization, Goose manages schema versions, google/uuid generates IDs, and Go's time package serializes timestamps.

Handlers use a database transaction for access checks and mutations. Failure rolls back writes. Room updates are broadcast only after commit. `access.go` locks affected PostgreSQL rows; `room_state.go` controls token visibility. WebSocket authentication lives in `websocket.go`; the hub has no database dependency.

PostgreSQL uses only `DATABASE_SCHEMA` (default `sprintpoints`) in its search path. There is no fallback to `public`. SQLite uses one connection with foreign keys enabled. Initial tables and subsequent schema changes are versioned SQL in `storage/migrations`. PostgreSQL migration locking prevents concurrent startup races. Both databases use the same SQL migration and store timestamps in UTC. GORM handles queries, row-lock clauses and table inspection through its dialect drivers. Migration history belongs to the new schema; unmanaged tables are rejected. Data transfer stays exclusively in the manual SQL file under `ops/database`; deployment instructions are in the root README.

## API and tests

Frontend endpoints, successful responses, room permissions and WebSocket events remain unchanged. Request parsing follows Gin: invalid input returns HTTP 422 with a string `detail`, booleans must be JSON booleans, CORS preflight returns 204, and timestamps use Go's RFC3339 serialization. These parser/error-format changes are intentional and documented in OpenAPI.

Tests cover room and issue lifecycle, ownership, private votes, token visibility, WebSockets, persisted data, schema migrations and manual data transfer. Run `go test -race ./...` and `go vet ./...`. Set `TEST_POSTGRES_URL` to include PostgreSQL checks; CI supplies PostgreSQL 17.

`httpapi/docs` embeds OpenAPI and documentation pages. WebSocket subscriptions are process-local: deploy one backend instance.
