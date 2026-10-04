-- Execute once against the legacy PostgreSQL database while the old app is
-- stopped. This entire DO statement is one transaction. PostgreSQL interprets
-- the legacy Python timestamps as UTC when copying to native timestamptz.
-- It creates a new sprintpoints schema and leaves public, including Alembic,
-- untouched. Rerunning it fails before writing anything.
DO $import$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'sprintpoints') THEN
        RAISE EXCEPTION 'sprintpoints schema already exists; refusing import';
    END IF;

    -- Hold a stable snapshot across validation, copy and verification. SHARE
    -- locks allow readers but block inserts, updates and deletes until commit.
    LOCK TABLE public.rooms, public.participants, public.issues, public.votes IN SHARE MODE;
    PERFORM set_config('TimeZone', 'UTC', true);

    IF EXISTS (
        SELECT 1 FROM public.participants p
        LEFT JOIN public.rooms r ON r.id = p.room_id
        WHERE r.id IS NULL OR p.id = ''
    ) OR EXISTS (
        SELECT 1 FROM public.issues i
        LEFT JOIN public.rooms r ON r.id = i.room_id
        WHERE r.id IS NULL OR i.id = ''
    ) OR EXISTS (
        SELECT 1 FROM public.rooms r
        LEFT JOIN public.participants p ON p.id = r.owner_id AND p.room_id = r.id
        WHERE r.id = '' OR (r.owner_id IS NOT NULL AND p.id IS NULL)
    ) OR EXISTS (
        SELECT 1 FROM public.rooms r
        LEFT JOIN public.issues i ON i.id = r.active_issue_id AND i.room_id = r.id
        WHERE r.active_issue_id IS NOT NULL AND i.id IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.votes v
        LEFT JOIN public.rooms r ON r.id = v.room_id
        LEFT JOIN public.issues i ON i.id = v.issue_id AND i.room_id = v.room_id
        LEFT JOIN public.participants p ON p.id = v.participant_id AND p.room_id = v.room_id
        WHERE r.id IS NULL OR i.id IS NULL OR p.id IS NULL OR v.id = ''
    ) THEN
        RAISE EXCEPTION 'legacy data has a missing or cross-room reference or empty ID; import refused';
    END IF;

    CREATE SCHEMA sprintpoints;
    CREATE TABLE sprintpoints.rooms (
        id varchar(36) PRIMARY KEY,
        code varchar(16) NOT NULL UNIQUE,
        name varchar(255) NOT NULL,
        host_token varchar(255) NOT NULL UNIQUE,
        owner_id varchar(36),
        card_set json NOT NULL,
        revealed boolean NOT NULL,
        active_issue_id varchar(36),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
    );
    CREATE TABLE sprintpoints.participants (
        id varchar(36) PRIMARY KEY,
        room_id varchar(36) NOT NULL REFERENCES sprintpoints.rooms(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        token varchar(255) NOT NULL UNIQUE,
        is_spectator boolean NOT NULL,
        last_seen_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL
    );
    CREATE INDEX participants_room_id_idx ON sprintpoints.participants(room_id);
    CREATE TABLE sprintpoints.issues (
        id varchar(36) PRIMARY KEY,
        room_id varchar(36) NOT NULL REFERENCES sprintpoints.rooms(id) ON DELETE CASCADE,
        title varchar(500) NOT NULL,
        description text NOT NULL,
        link varchar(2048) NOT NULL,
        position integer NOT NULL,
        estimate varchar(64),
        archived_at timestamptz,
        created_at timestamptz NOT NULL
    );
    CREATE INDEX issues_room_id_position_idx ON sprintpoints.issues(room_id, position);
    CREATE TABLE sprintpoints.votes (
        id varchar(36) PRIMARY KEY,
        room_id varchar(36) NOT NULL REFERENCES sprintpoints.rooms(id) ON DELETE CASCADE,
        issue_id varchar(36) NOT NULL REFERENCES sprintpoints.issues(id) ON DELETE CASCADE,
        participant_id varchar(36) NOT NULL REFERENCES sprintpoints.participants(id) ON DELETE CASCADE,
        value varchar(64) NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT uq_votes_issue_participant UNIQUE (issue_id, participant_id)
    );
    CREATE INDEX votes_room_id_idx ON sprintpoints.votes(room_id);

    INSERT INTO sprintpoints.rooms
        (id, code, name, host_token, owner_id, card_set, revealed, active_issue_id, created_at, updated_at)
    SELECT id, code, name, host_token, owner_id, card_set, revealed, active_issue_id, created_at, updated_at
    FROM public.rooms;
    INSERT INTO sprintpoints.participants
        (id, room_id, name, token, is_spectator, last_seen_at, created_at)
    SELECT id, room_id, name, token, is_spectator, last_seen_at, created_at
    FROM public.participants;
    INSERT INTO sprintpoints.issues
        (id, room_id, title, description, link, position, estimate, archived_at, created_at)
    SELECT id, room_id, title, description, link, position, estimate, archived_at, created_at
    FROM public.issues;
    INSERT INTO sprintpoints.votes
        (id, room_id, issue_id, participant_id, value, created_at, updated_at)
    SELECT id, room_id, issue_id, participant_id, value, created_at, updated_at
    FROM public.votes;

    -- EXCEPT compares every copied value, including JSON content and UTC
    -- instants. Primary keys and the reverse count check rule out extra rows.
    IF EXISTS (
        (SELECT id, code, name, host_token, owner_id, card_set::jsonb, revealed, active_issue_id,
                created_at::timestamptz, updated_at::timestamptz FROM public.rooms
         EXCEPT
         SELECT id, code, name, host_token, owner_id, card_set::jsonb, revealed, active_issue_id,
                created_at, updated_at FROM sprintpoints.rooms)
    ) OR (SELECT count(*) FROM public.rooms) <> (SELECT count(*) FROM sprintpoints.rooms)
    OR EXISTS (
        (SELECT id, room_id, name, token, is_spectator,
                last_seen_at::timestamptz, created_at::timestamptz FROM public.participants
         EXCEPT
         SELECT id, room_id, name, token, is_spectator, last_seen_at, created_at FROM sprintpoints.participants)
    ) OR (SELECT count(*) FROM public.participants) <> (SELECT count(*) FROM sprintpoints.participants)
    OR EXISTS (
        (SELECT id, room_id, title, description, link, position, estimate,
                archived_at::timestamptz, created_at::timestamptz FROM public.issues
         EXCEPT
         SELECT id, room_id, title, description, link, position, estimate, archived_at, created_at FROM sprintpoints.issues)
    ) OR (SELECT count(*) FROM public.issues) <> (SELECT count(*) FROM sprintpoints.issues)
    OR EXISTS (
        (SELECT id, room_id, issue_id, participant_id, value,
                created_at::timestamptz, updated_at::timestamptz FROM public.votes
         EXCEPT
         SELECT id, room_id, issue_id, participant_id, value, created_at, updated_at FROM sprintpoints.votes)
    ) OR (SELECT count(*) FROM public.votes) <> (SELECT count(*) FROM sprintpoints.votes)
    THEN
        RAISE EXCEPTION 'copied records differ from legacy source; import rolled back';
    END IF;
END
$import$;
