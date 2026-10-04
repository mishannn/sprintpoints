-- Execute once against the legacy PostgreSQL database while the old app is
-- stopped. This entire DO statement is one transaction. PostgreSQL interprets
-- the legacy Python timestamps as UTC when copying to the shared UTC timestamp columns.
-- Run after Go has created and migrated an empty sprintpoints schema. It
-- leaves public (including Alembic) and the Goose migration ledger untouched.
-- Rerunning it refuses nonempty target data tables before copying anything.
DO $import$
BEGIN
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

    -- Serialize competing importers and prevent the app from writing while
    -- checking for an empty target and inserting the source snapshot.
    LOCK TABLE sprintpoints.rooms, sprintpoints.participants,
               sprintpoints.issues, sprintpoints.votes IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM sprintpoints.rooms)
       OR EXISTS (SELECT 1 FROM sprintpoints.participants)
       OR EXISTS (SELECT 1 FROM sprintpoints.issues)
       OR EXISTS (SELECT 1 FROM sprintpoints.votes) THEN
        RAISE EXCEPTION 'sprintpoints data tables must be empty; refusing import';
    END IF;

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
