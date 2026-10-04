-- Run once against a new PostgreSQL database, before starting the Go server.
-- The existing public schema is never modified.
BEGIN;
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
COMMIT;
