-- Explicit setup for a new local SQLite database; do not apply to legacy data.
PRAGMA foreign_keys = ON;
BEGIN;

CREATE TABLE rooms (
    id varchar(36) PRIMARY KEY,
    code varchar(16) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    host_token varchar(255) NOT NULL UNIQUE,
    owner_id varchar(36),
    card_set json NOT NULL,
    revealed boolean NOT NULL,
    active_issue_id varchar(36),
    created_at datetime NOT NULL,
    updated_at datetime NOT NULL
);
CREATE TABLE participants (
    id varchar(36) PRIMARY KEY,
    room_id varchar(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    token varchar(255) NOT NULL UNIQUE,
    is_spectator boolean NOT NULL,
    last_seen_at datetime NOT NULL,
    created_at datetime NOT NULL
);
CREATE INDEX participants_room_id_idx ON participants(room_id);
CREATE TABLE issues (
    id varchar(36) PRIMARY KEY,
    room_id varchar(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    title varchar(500) NOT NULL,
    description text NOT NULL,
    link varchar(2048) NOT NULL,
    position integer NOT NULL,
    estimate varchar(64),
    archived_at datetime,
    created_at datetime NOT NULL
);
CREATE INDEX issues_room_id_position_idx ON issues(room_id, position);
CREATE TABLE votes (
    id varchar(36) PRIMARY KEY,
    room_id varchar(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    issue_id varchar(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    participant_id varchar(36) NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    value varchar(64) NOT NULL,
    created_at datetime NOT NULL,
    updated_at datetime NOT NULL,
    CONSTRAINT uq_votes_issue_participant UNIQUE(issue_id, participant_id)
);
CREATE INDEX votes_room_id_idx ON votes(room_id);
COMMIT;
