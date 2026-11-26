# Sprint Points backend

FastAPI + Pydantic + SQLAlchemy ORM on Cloudflare Python Workers. Room data
lives in D1; one `RoomHub` Durable Object owns the hibernatable WebSockets and
broadcasts `{"type":"room_updated"}` after mutations.

```text
Worker (src/worker.py)                   FastAPI (src/app.py)
──────────────────────                   ─────────────────────
RoomHub: WebSocket handshake,     ◀──    after each mutation
hibernation and fanout                   SQLAlchemy ORM → D1
Default: ASGI bridge for FastAPI         auth, validation, admin API
```

## Why this stack

- **FastAPI** keeps the HTTP contract explicit: routes, status codes,
  Pydantic request models and `{"detail": "..."}` errors.
- **SQLAlchemy ORM** defines the four tables as Python models. The
  `sqlalchemy-cloudflare-d1` dialect bridges synchronous ORM calls to the D1
  binding inside Python Workers.
- **D1** is the serverless SQLite database. Tables and indexes are created on
  the first request in each isolate with idempotent `CREATE ... IF NOT EXISTS`
  statements generated from the SQLAlchemy metadata.
- **RoomHub** is a Durable Object, used only for WebSockets. It stores a room
  ID as a socket attachment and filters on broadcast, so no extra tags or
  shared state are needed.

D1 auto-commits each statement. A handler that writes several rows is not a
single transaction (unlike the previous Durable Object implementation). For
this app's low write volume that trade-off keeps the backend small; use a D1
batch or a SQLite-backed Durable Object if strict multi-row atomicity becomes
necessary.

## Layout

| File | Purpose |
| --- | --- |
| `src/app.py` | FastAPI app, CORS/trailing-slash middleware, error handlers, router wiring. |
| `src/routes/rooms.py` | Create/join/load a room, transfer ownership, activate a story, reveal. |
| `src/routes/participants.py` | Heartbeat, spectator mode and host removal. |
| `src/routes/issues.py` | Story create/import/edit/delete/archive/estimate. |
| `src/routes/votes.py` | Cast/delete a vote and reset voting. |
| `src/routes/admin.py` | Admin export/import of the four tables. |
| `src/models.py` | SQLAlchemy table models. |
| `src/db.py` | D1 engine, schema bootstrap and FastAPI session dependency. |
| `src/schemas.py` | Pydantic request bodies. |
| `src/security.py` | Token comparison, header annotations and access checks. |
| `src/views.py` | Row-to-JSON shaping and token visibility rules. |
| `src/clock.py` | UTC timestamp creation/formatting. |
| `src/identity.py` | UUIDs, tokens and room codes. |
| `src/events.py` | Notify the WebSocket Durable Object after a mutation. |
| `src/config.py` | Constants, headers and Worker settings lookup. |
| `src/worker.py` | `Default` Worker entrypoint and the `RoomHub` Durable Object. |
| `tests/test_app.py` | Route, auth, admin and validation tests on in-memory SQLite. |
| `scripts/` | Smoke/WebSocket checks and the dump importer. |
| `wrangler.jsonc` | Worker entry, D1 binding `DB`, Durable Object binding `ROOMS`. |

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
API views convert them, while `/api/admin/export` keeps the raw rows so
backups round-trip exactly.

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

Errors are always `{"detail": "..."}`; validation failures return `422`,
unknown paths `404`, wrong methods `405`. Authenticated room routes accept
`X-Host-Token` and `X-Participant-Token`. The admin routes accept
`X-Admin-Token`.

The WebSocket sends `{"type":"room_updated"}` after every committed mutation.
Unauthorized handshakes get `403` before the socket is accepted.

## Admin endpoints

| Route | Header | Purpose |
| --- | --- | --- |
| `GET /api/admin/export` | `X-Admin-Token` | Full JSON dump of all four tables (backup). |
| `POST /api/admin/import` | `X-Admin-Token` | Replace all rows from such a dump; validates references first. |

Both return `404` unless the `ADMIN_TOKEN` secret is set. The import accepts
the dump directly (and also `{"data": <dump>}`).

## Local development

Requirements: Node 24+, Python 3.13+ and uv 0.13.4+.

```bash
uv sync --group dev
uv run pywrangler dev          # http://127.0.0.1:8787, local D1
```

Optional `.dev.vars`:

```bash
ADMIN_TOKEN=local-development-token
```

The local D1 database is created automatically; the placeholder
`database_id` in `wrangler.jsonc` is only needed for a remote deploy.

Checks:

```bash
uv run ruff check .
uv run pytest                  # in-memory SQLite, no Cloudflare account
node scripts/smoke-test.mjs http://127.0.0.1:8787
node scripts/ws-test.mjs http://127.0.0.1:8787
```

## Deploy

```bash
npx wrangler d1 create sprintpoints
# put the returned database_id into wrangler.jsonc
uv run pywrangler deploy
npx wrangler secret put ADMIN_TOKEN
```

The GitHub workflow substitutes the D1 ID from the `D1_DATABASE_ID` secret and
uses `CLOUDFLARE_API_TOKEN` to deploy. Add a `RoomHub` Durable Object
migration when changing its class:

```jsonc
"migrations": [{ "tag": "v2", "new_sqlite_classes": ["RoomHub"] }]
```

`v2` creates `RoomHub`. The old `RoomDatabase` class is no longer exported,
so export its data through the old admin endpoint before deploying this
version if you need to keep the rooms.
