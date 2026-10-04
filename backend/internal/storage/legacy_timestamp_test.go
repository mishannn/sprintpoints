package storage

import (
	"path/filepath"
	"testing"

	"github.com/mishannn/sprintpoints/backend/internal/domain"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSQLiteLegacyDatetimeISOFormatting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy-datetime.db")
	setup, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, ddl := range []string{
		"CREATE TABLE rooms (id VARCHAR(36) PRIMARY KEY, code VARCHAR(16), name VARCHAR(255), host_token VARCHAR(255), card_set JSON, revealed BOOLEAN, active_issue_id VARCHAR(36), created_at DATETIME, updated_at DATETIME)",
		"CREATE TABLE issues (id VARCHAR(36) PRIMARY KEY, room_id VARCHAR(36), title VARCHAR(500), description TEXT, link VARCHAR(2048), position INTEGER, estimate VARCHAR(64), archived_at DATETIME, created_at DATETIME)",
		"CREATE TABLE participants (id VARCHAR(36) PRIMARY KEY, room_id VARCHAR(36), name VARCHAR(255), token VARCHAR(255), is_spectator BOOLEAN, last_seen_at DATETIME, created_at DATETIME)",
		"CREATE TABLE votes (id VARCHAR(36) PRIMARY KEY, room_id VARCHAR(36), issue_id VARCHAR(36), participant_id VARCHAR(36), value VARCHAR(64), created_at DATETIME, updated_at DATETIME)",
	} {
		if err := setup.Exec(ddl).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := setup.Exec("INSERT INTO rooms VALUES('r','c','r','h','[]',0,NULL,'2026-03-02 10:20:30.123456','2026-03-02 10:20:30')").Error; err != nil {
		t.Fatal(err)
	}
	if err := setup.Exec("INSERT INTO issues VALUES('i','r','i','','',0,NULL,NULL,'2026-03-02 10:20:30.123456')").Error; err != nil {
		t.Fatal(err)
	}
	if err := setup.Exec("INSERT INTO participants VALUES('p','r','p','t',0,'2026-03-02 10:20:30','2026-03-02 10:20:30')").Error; err != nil {
		t.Fatal(err)
	}
	if err := setup.Exec("INSERT INTO votes VALUES('v','r','i','p','5','2026-03-02 10:20:30.123456','2026-03-02 10:20:30')").Error; err != nil {
		t.Fatal(err)
	}
	if sqlDB, err := setup.DB(); err == nil {
		_ = sqlDB.Close()
	}
	db, err := OpenDatabase(sqliteURL(path))
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(db)
	var issue domain.Issue
	if err := db.First(&issue, "id = ?", "i").Error; err != nil {
		t.Fatal(err)
	}
	var vote domain.Vote
	if err := db.First(&vote, "id = ?", "v").Error; err != nil {
		t.Fatal(err)
	}
	if got := domain.FormatTimestamp(issue.CreatedAt); got != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("issue timestamp %q", got)
	}
	if got := domain.FormatTimestamp(vote.CreatedAt); got != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("vote timestamp %q", got)
	}
	if got := domain.FormatTimestamp(vote.UpdatedAt); got != "2026-03-02T10:20:30Z" {
		t.Fatalf("whole-second timestamp %q", got)
	}
}
