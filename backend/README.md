# Sprint Points backend

TypeScript API on Cloudflare Workers. Hono serves the HTTP routes, Drizzle ORM
owns the SQLite schema, and both run inside one `RoomDatabase` Durable Object
that also keeps hibernatable WebSockets. Every request and room update is
serialized in the same object, so writes and broadcasts stay local and
consistent.

```text
Worker (src/index.ts)                  RoomDatabase Durable Object
─────────────────────                  ───────────────────────────
default export: thin proxy       ──▶   Hono app (src/app.ts)
                                       Drizzle ORM → ctx.storage.sql
                                       SQL migrations on startup
                                       WebSocket handshake + fanout
```

## Stack

- **Hono** — routing, middleware, JSON helpers and typed bindings.
- **Drizzle ORM** — table definitions in `src/schema.ts`, typed queries against
  Durable Object SQLite. No hand-written DB adapter.
- **Drizzle Kit** — generates the SQL in `drizzle/`. The generated
  `drizzle/migrations.js` is passed to `migrate()` in the Durable Object
  constructor under `blockConcurrencyWhile`, so deploys migrate automatically.
- **Zod + shared schemas** — request bodies are validated with the same schemas
  the frontend imports from `@sprintpoints/shared`.
- **hono-openapi** — route metadata plus Zod request/response schemas generate
  the OpenAPI 3.1 document. The Worker serves it at `/api/openapi.json`, and
  `backend/openapi.json` is generated for tooling.
- **Hey API (`@hey-api/openapi-ts`)** — generates the typed fetch client in
  `src/shared/api/generated` from `backend/openapi.json`.
- **Vitest + `@cloudflare/vitest-plugin`** — integration tests execute inside
  the Workers runtime against real Durable Object storage.

## Layout

| File | Purpose |
| --- | --- |
| `src/index.ts` | Worker entrypoint, `RoomDatabase` Durable Object, WebSocket auth and broadcast. |
| `src/app.ts` | Hono app: CORS, trailing-slash redirects, all API routes and errors. |
| `src/openapi.ts` | OpenAPI response schemas, security schemes and document metadata. |
| `src/schema.ts` | Drizzle tables, indexes and inferred row types. |
| `src/lib.ts` | IDs, tokens, room codes, timestamps and token comparison. |
| `src/env.ts` | Worker binding types. |
| `drizzle/` | Generated migrations (`npx drizzle-kit generate`). |
| `openapi.json` | Generated OpenAPI 3.1 document (`npm run openapi:generate`). |
| `scripts/generate-openapi.ts` | Builds the document from the route definitions and Zod schemas. |
| `test/` | HTTP, auth, admin, story, OpenAPI and WebSocket tests. |
| `scripts/` | Smoke/WebSocket checks and the dump importer. |
| `wrangler.jsonc` | Worker entry, Durable Object binding and migrations. |

## Storage schema

```sql
rooms(id, code UNIQUE, name, host_token UNIQUE, owner_id, card_set JSON text,
      revealed, active_issue_id, created_at, updated_at)
participants(id, room_id, name, token UNIQUE, is_spectator, last_seen_at, created_at)
issues(id, room_id, title, description, link, position, estimate, archived_at, created_at)
votes(id, room_id, issue_id, participant_id, value, created_at, updated_at,
      UNIQUE(issue_id, participant_id))
```

Timestamps are ISO-8601 UTC strings. Booleans are stored as SQLite integers;
API views convert them, while `/api/admin/export` keeps the raw rows so backups
round-trip exactly.

The class name, Durable Object migration tag and tables match the previous
backend. The initial Drizzle migration uses `IF NOT EXISTS`, so deploying over
an existing `RoomDatabase` keeps its rooms, participants, stories and votes.

## API surface

```text
GET    /api/health
POST   /api/rooms
POST   /api/rooms/{code}/join
GET    /api/rooms/{code}
POST   /api/rooms/{room}/transfer-ownership
POST   /api/participants/{participant}/heartbeat
PATCH  /api/participants/{participant}
DELETE /api/rooms/{room}/participants/{participant}
POST   /api/rooms/{room}/issues
POST   /api/rooms/{room}/issues/import
PATCH  /api/issues/{issue}
DELETE /api/rooms/{room}/issues/{issue}[?next_active_issue_id=...]
PATCH  /api/rooms/{room}/issues/{issue}/archive
POST   /api/rooms/{room}/issues/archive-estimated
PATCH  /api/rooms/{room}/issues/{issue}/unarchive
PATCH  /api/rooms/{room}/active-issue
PATCH  /api/issues/{issue}/estimate
PUT    /api/rooms/{room}/issues/{issue}/votes/{participant}
PATCH  /api/rooms/{room}/reveal
POST   /api/rooms/{room}/issues/{issue}/reset-votes
DELETE /api/issues/{issue}/votes/{participant}
GET    /api/rooms/{room}/ws?participantToken=...&hostToken=...
```

`GET /api/openapi.json` serves the generated OpenAPI 3.1 document.

Errors are always `{"detail": "..."}`; validation failures return `422`,
unknown paths `404`, wrong methods `405`. Authenticated room routes accept
`X-Host-Token` and `X-Participant-Token`. Admin routes accept `X-Admin-Token`.

The WebSocket sends `{"type":"room_updated"}` after every committed mutation.
Unauthorized handshakes get `403` before the socket is accepted.

## Admin endpoints

| Route | Header | Purpose |
| --- | --- | --- |
| `GET /api/admin/export` | `X-Admin-Token` | Full JSON dump of all four tables (backup). |
| `POST /api/admin/import` | `X-Admin-Token` | Replace all rows from such a dump; validates references first. |

Both return `404` unless the `ADMIN_TOKEN` secret is set. The import accepts
the dump directly and also `{"data": <dump>}`.

## Local development

```bash
npm install                    # from the repository root
npm run backend:dev            # http://127.0.0.1:8787, local DO storage
```

Optional `backend/.dev.vars`:

```bash
ADMIN_TOKEN=local-development-token
```

Checks:

```bash
npm run backend:check
npm run backend:test
npm run openapi:generate
node backend/scripts/smoke-test.mjs http://127.0.0.1:8787
node backend/scripts/ws-test.mjs http://127.0.0.1:8787
```

## Changing the database schema

Edit `src/schema.ts`, then generate and commit the migration:

```bash
cd backend
npx drizzle-kit generate --name add_something
```

The Durable Object applies pending migrations on its next start. Do not use
`drizzle-kit push` against a deployed Worker; the checked-in SQL migrations are
the deployment path.

## Changing the API

Request schemas live in `shared/schemas.ts`, shared by the frontend and the
Worker. Response schemas and route metadata live in `src/openapi.ts`.
`describeRoute()` in `src/app.ts` attaches the operation id, security, request
body and response schemas to each Hono route. Hono path parameters and validated
JSON bodies are documented automatically.

After changing routes or schemas, regenerate the specification and the typed
client from the repository root:

```bash
npm run openapi:generate
```

This writes `backend/openapi.json` and regenerates
`src/shared/api/generated`. Both are committed. CI regenerates them and fails if
the checked-in files differ. The frontend uses the generated SDK through
`src/shared/api/client.ts`.

## Deploy

```bash
cd backend
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN
```

The GitHub workflow uses the `CLOUDFLARE_API_TOKEN` secret (Workers
Scripts:Edit, Durable Objects:Edit, Workers Routes:Edit).
