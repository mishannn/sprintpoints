package storage

// schemaDDL is the explicit cross-dialect baseline schema. Explicit DDL keeps
// the Go schema aligned with the existing Alembic-managed production database.
func schemaDDL(d string) []string {
	boolean := "BOOLEAN"
	timestamp := "TIMESTAMP"
	if d == "sqlite" {
		boolean = "BOOLEAN"
	} else {
		timestamp = "TIMESTAMP WITH TIME ZONE"
	}
	return []string{
		"CREATE TABLE rooms (id VARCHAR(36) NOT NULL PRIMARY KEY, code VARCHAR(16) NOT NULL, name VARCHAR(255) NOT NULL, host_token VARCHAR(255) NOT NULL UNIQUE, card_set JSON NOT NULL, revealed " + boolean + " NOT NULL, active_issue_id VARCHAR(36), created_at " + timestamp + " NOT NULL, updated_at " + timestamp + " NOT NULL)",
		"CREATE UNIQUE INDEX ix_rooms_code ON rooms(code)",
		"CREATE TABLE issues (id VARCHAR(36) NOT NULL PRIMARY KEY, room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, title VARCHAR(500) NOT NULL, description TEXT NOT NULL, link VARCHAR(2048) NOT NULL, position INTEGER NOT NULL, estimate VARCHAR(64), archived_at " + timestamp + ", created_at " + timestamp + " NOT NULL)",
		"CREATE INDEX issues_room_id_position_idx ON issues(room_id, position)",
		"CREATE TABLE participants (id VARCHAR(36) NOT NULL PRIMARY KEY, room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, token VARCHAR(255) NOT NULL UNIQUE, is_spectator " + boolean + " NOT NULL, last_seen_at " + timestamp + " NOT NULL, created_at " + timestamp + " NOT NULL)",
		"CREATE INDEX participants_room_id_idx ON participants(room_id)",
		"CREATE TABLE votes (id VARCHAR(36) NOT NULL PRIMARY KEY, room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, issue_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE, participant_id VARCHAR(36) NOT NULL REFERENCES participants(id) ON DELETE CASCADE, value VARCHAR(64) NOT NULL, created_at " + timestamp + " NOT NULL, updated_at " + timestamp + " NOT NULL, CONSTRAINT uq_votes_issue_participant UNIQUE(issue_id, participant_id))",
		"CREATE INDEX votes_room_id_idx ON votes(room_id)",
	}
}
