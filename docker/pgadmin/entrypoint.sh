set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

printf 'db:5432:%s:%s:%s\n' "$POSTGRES_DB" "$POSTGRES_USER" "$POSTGRES_PASSWORD" > /tmp/pgpass
chmod 600 /tmp/pgpass

exec /entrypoint.sh "$@"
