-- One-shot transfer from a legacy Go schema to the NestJS backend.
--
-- Run this once after:
--   1. the old backend has been stopped,
--   2. the NestJS schema has been created and migrated by backend,
--   3. the NestJS target tables are still empty.
--
-- Defaults: source "sprintpoints" (the Go schema) -> target "sprintpoints_nest"
-- (the NestJS schema). Override with psql variables, for example:
--   psql -v source_schema=public -v target_schema=sprintpoints_nest ...
--
-- Room IDs, participant IDs, tokens, issue IDs, vote IDs, card sets and
-- timestamps are preserved. Source data and its migration metadata are never
-- modified. A nonempty target or invalid/cross-room source data aborts the
-- whole statement, leaving the target untouched.

\if :{?source_schema}
\else
\set source_schema sprintpoints
\endif

\if :{?target_schema}
\else
\set target_schema sprintpoints_nest
\endif

SELECT set_config('sprintpoints.transfer_source', :'source_schema', false);
SELECT set_config('sprintpoints.transfer_target', :'target_schema', false);

DO $import$
DECLARE
    src text := current_setting('sprintpoints.transfer_source');
    dst text := current_setting('sprintpoints.transfer_target');
    invalid boolean;
    nonempty boolean;
    differs boolean;
BEGIN
    IF src = dst THEN
        RAISE EXCEPTION 'source and target schemas must differ';
    END IF;

    IF to_regclass(format('%1$I.rooms', src)) IS NULL
       OR to_regclass(format('%1$I.participants', src)) IS NULL
       OR to_regclass(format('%1$I.issues', src)) IS NULL
       OR to_regclass(format('%1$I.votes', src)) IS NULL THEN
        RAISE EXCEPTION 'source schema % is missing rooms, participants, issues or votes', src;
    END IF;

    IF to_regclass(format('%1$I.rooms', dst)) IS NULL
       OR to_regclass(format('%1$I.participants', dst)) IS NULL
       OR to_regclass(format('%1$I.issues', dst)) IS NULL
       OR to_regclass(format('%1$I.votes', dst)) IS NULL THEN
        RAISE EXCEPTION 'target schema % is not prepared; run the NestJS migration first', dst;
    END IF;

    IF to_regclass(format('%1$I.nestjs_migrations', dst)) IS NULL THEN
        RAISE EXCEPTION 'target schema % has no NestJS migration ledger; run the NestJS migration first', dst;
    END IF;

    -- Hold a stable source snapshot. SHARE locks allow readers but block
    -- inserts, updates and deletes until this statement commits.
    EXECUTE format(
        'LOCK TABLE %1$I.rooms, %1$I.participants, %1$I.issues, %1$I.votes IN SHARE MODE',
        src);
    PERFORM set_config('TimeZone', 'UTC', true);

    EXECUTE format($q$
        SELECT EXISTS (
            SELECT 1 FROM %1$I.participants p
            LEFT JOIN %1$I.rooms r ON r.id = p.room_id
            WHERE r.id IS NULL OR p.id = ''
        )
    $q$, src) INTO invalid;
    IF invalid THEN
        RAISE EXCEPTION 'source participants have a missing room or empty ID; import refused';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            SELECT 1 FROM %1$I.issues i
            LEFT JOIN %1$I.rooms r ON r.id = i.room_id
            WHERE r.id IS NULL OR i.id = ''
        )
    $q$, src) INTO invalid;
    IF invalid THEN
        RAISE EXCEPTION 'source issues have a missing room or empty ID; import refused';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            SELECT 1 FROM %1$I.rooms r
            LEFT JOIN %1$I.participants p ON p.id = r.owner_id AND p.room_id = r.id
            WHERE r.id = '' OR (r.owner_id IS NOT NULL AND p.id IS NULL)
        )
    $q$, src) INTO invalid;
    IF invalid THEN
        RAISE EXCEPTION 'source rooms have a missing owner or empty ID; import refused';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            SELECT 1 FROM %1$I.rooms r
            LEFT JOIN %1$I.issues i ON i.id = r.active_issue_id AND i.room_id = r.id
            WHERE r.active_issue_id IS NOT NULL AND i.id IS NULL
        )
    $q$, src) INTO invalid;
    IF invalid THEN
        RAISE EXCEPTION 'source rooms reference a missing active issue; import refused';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            SELECT 1 FROM %1$I.votes v
            LEFT JOIN %1$I.rooms r ON r.id = v.room_id
            LEFT JOIN %1$I.issues i ON i.id = v.issue_id AND i.room_id = v.room_id
            LEFT JOIN %1$I.participants p ON p.id = v.participant_id AND p.room_id = v.room_id
            WHERE r.id IS NULL OR i.id IS NULL OR p.id IS NULL OR v.id = ''
        )
    $q$, src) INTO invalid;
    IF invalid THEN
        RAISE EXCEPTION 'source votes have a missing or cross-room reference or empty ID; import refused';
    END IF;

    -- Serialize competing importers and prevent the NestJS app from writing
    -- while checking the target and inserting the source snapshot.
    EXECUTE format(
        'LOCK TABLE %1$I.rooms, %1$I.participants, %1$I.issues, %1$I.votes IN ACCESS EXCLUSIVE MODE',
        dst);

    EXECUTE format($q$
        SELECT EXISTS (SELECT 1 FROM %1$I.rooms)
            OR EXISTS (SELECT 1 FROM %1$I.participants)
            OR EXISTS (SELECT 1 FROM %1$I.issues)
            OR EXISTS (SELECT 1 FROM %1$I.votes)
    $q$, dst) INTO nonempty;
    IF nonempty THEN
        RAISE EXCEPTION 'target schema % data tables must be empty; refusing import', dst;
    END IF;

    EXECUTE format($q$
        INSERT INTO %1$I.rooms
            (id, code, name, host_token, owner_id, card_set, revealed, active_issue_id, created_at, updated_at)
        SELECT id, code, name, host_token, owner_id, card_set::text, revealed, active_issue_id,
               created_at::timestamp, updated_at::timestamp
        FROM %2$I.rooms
    $q$, dst, src);

    EXECUTE format($q$
        INSERT INTO %1$I.participants
            (id, room_id, name, token, is_spectator, last_seen_at, created_at)
        SELECT id, room_id, name, token, is_spectator,
               last_seen_at::timestamp, created_at::timestamp
        FROM %2$I.participants
    $q$, dst, src);

    EXECUTE format($q$
        INSERT INTO %1$I.issues
            (id, room_id, title, description, link, position, estimate, archived_at, created_at)
        SELECT id, room_id, title, description, link, position, estimate,
               archived_at::timestamp, created_at::timestamp
        FROM %2$I.issues
    $q$, dst, src);

    EXECUTE format($q$
        INSERT INTO %1$I.votes
            (id, room_id, issue_id, participant_id, value, created_at, updated_at)
        SELECT id, room_id, issue_id, participant_id, value,
               created_at::timestamp, updated_at::timestamp
        FROM %2$I.votes
    $q$, dst, src);

    -- EXCEPT compares every copied value, including JSON content and UTC
    -- instants. Primary keys and the reverse count check rule out extra rows.
    EXECUTE format($q$
        SELECT EXISTS (
            (SELECT id, code, name, host_token, owner_id, card_set::jsonb, revealed, active_issue_id,
                    created_at::timestamp, updated_at::timestamp FROM %2$I.rooms
             EXCEPT
             SELECT id, code, name, host_token, owner_id, card_set::jsonb, revealed, active_issue_id,
                    created_at::timestamp, updated_at::timestamp FROM %1$I.rooms)
        ) OR (SELECT count(*) FROM %2$I.rooms) <> (SELECT count(*) FROM %1$I.rooms)
    $q$, dst, src) INTO differs;
    IF differs THEN
        RAISE EXCEPTION 'copied rooms differ from the source; import rolled back';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            (SELECT id, room_id, name, token, is_spectator,
                    last_seen_at::timestamp, created_at::timestamp FROM %2$I.participants
             EXCEPT
             SELECT id, room_id, name, token, is_spectator,
                    last_seen_at::timestamp, created_at::timestamp FROM %1$I.participants)
        ) OR (SELECT count(*) FROM %2$I.participants) <> (SELECT count(*) FROM %1$I.participants)
    $q$, dst, src) INTO differs;
    IF differs THEN
        RAISE EXCEPTION 'copied participants differ from the source; import rolled back';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            (SELECT id, room_id, title, description, link, position, estimate,
                    archived_at::timestamp, created_at::timestamp FROM %2$I.issues
             EXCEPT
             SELECT id, room_id, title, description, link, position, estimate,
                    archived_at::timestamp, created_at::timestamp FROM %1$I.issues)
        ) OR (SELECT count(*) FROM %2$I.issues) <> (SELECT count(*) FROM %1$I.issues)
    $q$, dst, src) INTO differs;
    IF differs THEN
        RAISE EXCEPTION 'copied issues differ from the source; import rolled back';
    END IF;

    EXECUTE format($q$
        SELECT EXISTS (
            (SELECT id, room_id, issue_id, participant_id, value,
                    created_at::timestamp, updated_at::timestamp FROM %2$I.votes
             EXCEPT
             SELECT id, room_id, issue_id, participant_id, value,
                    created_at::timestamp, updated_at::timestamp FROM %1$I.votes)
        ) OR (SELECT count(*) FROM %2$I.votes) <> (SELECT count(*) FROM %1$I.votes)
    $q$, dst, src) INTO differs;
    IF differs THEN
        RAISE EXCEPTION 'copied votes differ from the source; import rolled back';
    END IF;
END
$import$;
