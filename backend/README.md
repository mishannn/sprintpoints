# Backend architecture

`cmd/server/main.go` wires the database and HTTP server, runs startup migrations, and handles health checks and graceful shutdown.

| Package | Responsibility | Where to start |
| --- | --- | --- |
| `internal/domain` | Room, participant, issue and vote entities; JSON card sets and timestamp serialization | `room.go`, `participant.go`, `issue.go`, `vote.go` |
| `internal/httpapi` | Public routes, feature handlers, access checks and room-state presentation | `routes.go`, then `rooms_handlers.go`, `participants_handlers.go`, `issues_handlers.go`, `votes_handlers.go` |
| `internal/storage` | Database selection, connections, explicit schema and startup migrations | `configuration.go`, `database.go`, `migrations.go`, `schema.go` |
| `internal/validation` | Required/nullable fields, boolean coercion, content types and precise malformed-JSON errors | `schema.go`, `body.go`, `json_errors.go` |
| `internal/realtime` | Process-local WebSocket subscriptions and room update broadcasts | `hub.go` |

## Request flow

`httpapi/transport.go` handles CORS, redirects and route/method errors. `routes.go` declares each endpoint's method, status, schema and named handler.

`request.go` validates the body before opening a database transaction. Handlers use the transaction for access checks and mutations. Expected failures are translated into API errors; any handler failure rolls back its writes. A room update is broadcast only after the transaction commits, so clients can immediately read the updated state.

`access.go` checks host and participant credentials and locks the affected PostgreSQL rows for concurrent mutations. `queries.go` loads entities; handlers enforce their room membership. `room_state.go` controls credential visibility in responses. WebSocket authentication stays in `websocket.go`; the hub has no database dependency.

SQLite uses a single connection with foreign keys enabled. PostgreSQL migrations use an advisory lock. The persisted `alembic_version` identifiers and accepted database URL formats remain part of compatibility with deployed databases.

## Tests and documentation

Tests live beside their packages. HTTP integration tests cover security, voting, issue lifecycle and WebSocket updates. `testdata/http_contract.json` freezes established HTTP responses; `testdata/legacy_python.sql` preserves a database created by the former backend. These fixtures protect compatibility without keeping the old runtime.

`httpapi/docs` embeds the public OpenAPI description and documentation pages. Update them when intentionally changing the API.

Run `go test -race ./...` and `go vet ./...` from the repository root. Set `TEST_POSTGRES_URL` to include PostgreSQL integration checks; CI provides an isolated PostgreSQL service.
