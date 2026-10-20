#!/usr/bin/env bash
# One-shot cutover from the Go backend to the NestJS backend.
#
# It stops the old backend, takes a full PostgreSQL backup, builds the NestJS
# image, creates/migrates its isolated schema, copies the data with the
# transactional SQL import, starts the new backend, and points Caddy at it.
# The Go container and its schema are left untouched for rollback.
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose}"
SOURCE_SCHEMA_OVERRIDE="${SOURCE_SCHEMA-}"
TARGET_SCHEMA_OVERRIDE="${TARGET_SCHEMA-}"
BACKUP_FILE_OVERRIDE="${BACKUP_FILE-}"

fail() {
  echo "error: $*" >&2
  exit 1
}

[[ -f .env ]] || fail "create .env from .env.example first"
command -v docker >/dev/null 2>&1 || fail "docker is required"

# Compose reads these from the shell and .env.
set -a
# shellcheck disable=SC1091
source ./.env
set +a

SOURCE_SCHEMA="${SOURCE_SCHEMA_OVERRIDE:-${SOURCE_SCHEMA:-sprintpoints}}"
TARGET_SCHEMA="${TARGET_SCHEMA_OVERRIDE:-${TARGET_SCHEMA:-${NEST_DATABASE_SCHEMA:-sprintpoints_nest}}}"
BACKUP_FILE="${BACKUP_FILE_OVERRIDE:-${BACKUP_FILE:-backup-before-nestjs-$(date -u +%Y%m%dT%H%M%SZ).sql}}"

valid_source_schema() {
  [[ "$1" =~ ^[a-z_][a-z0-9_]{0,62}$ && "$1" != pg_* ]]
}
valid_target_schema() {
  [[ "$1" =~ ^[a-z_][a-z0-9_]{0,62}$ && "$1" != "public" && "$1" != pg_* ]]
}
valid_source_schema "$SOURCE_SCHEMA" || fail "invalid SOURCE_SCHEMA: $SOURCE_SCHEMA"
valid_target_schema "$TARGET_SCHEMA" || fail "invalid TARGET_SCHEMA: $TARGET_SCHEMA"
[[ "$SOURCE_SCHEMA" != "$TARGET_SCHEMA" ]] || fail "source and target schemas must differ"

# Keep the long-running NestJS service and the one-off migration container on
# the same target schema, even when TARGET_SCHEMA overrides the Compose default.
export NEST_DATABASE_SCHEMA="$TARGET_SCHEMA"

rollback() {
  echo "Cutover failed. Restoring the old backend behind Caddy..." >&2
  $COMPOSE stop backend-nest >/dev/null 2>&1 || true
  BACKEND_UPSTREAM="backend:8000" $COMPOSE up -d backend --no-deps >/dev/null 2>&1 || true
  BACKEND_UPSTREAM="backend:8000" $COMPOSE up -d caddy --no-deps --force-recreate >/dev/null 2>&1 || true
  echo "The old backend was restarted. Backup: $BACKUP_FILE" >&2
}
trap rollback ERR

echo "1/7 Stopping application backends to freeze writes"
$COMPOSE stop backend backend-nest >/dev/null 2>&1 || true

echo "2/7 Ensuring PostgreSQL is running and taking a backup"
$COMPOSE up -d db
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] || fail "database backup is empty"

echo "3/7 Building the NestJS backend"
$COMPOSE build backend-nest

echo "4/7 Creating and migrating the target schema ($TARGET_SCHEMA)"
$COMPOSE run --rm --no-deps -e DATABASE_SCHEMA="$TARGET_SCHEMA" backend-nest node dist/main.js -migrate

echo "5/7 Copying data from $SOURCE_SCHEMA to $TARGET_SCHEMA"
$COMPOSE exec -T db sh -c \
  "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v source_schema='$SOURCE_SCHEMA' -v target_schema='$TARGET_SCHEMA'" \
  < ops/database/migrate-to-nestjs.sql

echo "6/7 Starting the NestJS backend"
$COMPOSE up -d backend-nest
for _ in $(seq 1 30); do
  if $COMPOSE exec -T backend-nest node dist/main.js -healthcheck >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
$COMPOSE exec -T backend-nest node dist/main.js -healthcheck \
  || fail "NestJS backend did not become healthy"

echo "7/7 Pointing Caddy at backend-nest:8000"
BACKEND_UPSTREAM="backend-nest:8000" $COMPOSE up -d caddy --no-deps --force-recreate

trap - ERR
echo
echo "Cutover complete."
echo "  Source schema (preserved): $SOURCE_SCHEMA"
echo "  Target schema (active):    $TARGET_SCHEMA"
echo "  Backup:                    $BACKUP_FILE"
echo "  Caddy upstream:            backend-nest:8000"
echo
echo "Persist this cutover for future compose runs:"
echo "  NEST_DATABASE_SCHEMA=$TARGET_SCHEMA"
echo "  BACKEND_UPSTREAM=backend-nest:8000"
echo
echo "Rollback before new writes:"
echo "  BACKEND_UPSTREAM=backend:8000 $COMPOSE up -d caddy --no-deps --force-recreate"
echo "  $COMPOSE up -d backend"
