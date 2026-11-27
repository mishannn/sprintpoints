-- Dump the old NestJS/PostgreSQL backend as one JSON document for the Worker import.
-- Usage:
--   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -f postgres_export.sql > sprintpoints-dump.json
-- Schema name can be overridden with -v schema=other (default: sprintpoints_nest).

\if :{?schema}
\else
  \set schema sprintpoints_nest
\endif

WITH
rooms AS (
  SELECT id, code, name, host_token, owner_id, card_set, revealed, active_issue_id,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
  FROM :"schema".rooms
  ORDER BY created_at
),
participants AS (
  SELECT id, room_id, name, token, is_spectator,
         to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen_at,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM :"schema".participants
  ORDER BY created_at
),
issues AS (
  SELECT id, room_id, title, description, link, position, estimate,
         to_char(archived_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS archived_at,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM :"schema".issues
  ORDER BY position
),
votes AS (
  SELECT id, room_id, issue_id, participant_id, value,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
  FROM :"schema".votes
  ORDER BY created_at
)
SELECT json_build_object(
  'rooms', (SELECT coalesce(json_agg(rooms), '[]'::json) FROM rooms),
  'participants', (SELECT coalesce(json_agg(participants), '[]'::json) FROM participants),
  'issues', (SELECT coalesce(json_agg(issues), '[]'::json) FROM issues),
  'votes', (SELECT coalesce(json_agg(votes), '[]'::json) FROM votes)
);
