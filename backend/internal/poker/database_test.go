package poker

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFreshAndIdempotentMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fresh.db")
	db, err := OpenDatabase(sqliteURL(path))
	if err != nil {
		t.Fatal(err)
	}
	var revision string
	if err := db.Raw("SELECT version_num FROM alembic_version").Scan(&revision).Error; err != nil {
		t.Fatal(err)
	}
	if revision != headRevision {
		t.Fatalf("revision=%q", revision)
	}
	now := time.Now()
	if err := db.Create(&Room{ID: "r1", Code: "C", Name: "Room", HostToken: "secret", CardSet: JSONStrings{"1", "2"}, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := OpenDatabase(sqliteURL(path)); err != nil {
		t.Fatal(err)
	}
	var got Room
	if err := db.First(&got, "id = ?", "r1").Error; err != nil {
		t.Fatal(err)
	}
	if len(got.CardSet) != 2 || got.CardSet[0] != "1" {
		t.Fatalf("card set not preserved: %#v", got.CardSet)
	}
}

// Set TEST_POSTGRES_URL to exercise production-dialect DDL and behavior.
func TestPostgresPersistence(t *testing.T) {
	baseURL := os.Getenv("TEST_POSTGRES_URL")
	if baseURL == "" {
		t.Skip("TEST_POSTGRES_URL is not set")
	}
	for _, legacy := range []bool{false, true} {
		name := "fresh"
		if legacy {
			name = "legacy"
		}
		t.Run(name, func(t *testing.T) {
			schema := fmt.Sprintf("poker_test_%d", time.Now().UnixNano())
			admin, err := gorm.Open(postgresDialector(baseURL), &gorm.Config{})
			if err != nil {
				t.Fatal(err)
			}
			adminSQL, err := admin.DB()
			if err != nil {
				t.Fatal(err)
			}
			defer adminSQL.Close()
			if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
				t.Fatal(err)
			}
			defer admin.Exec("DROP SCHEMA " + schema + " CASCADE")
			isolatedURL, err := postgresSchemaURL(baseURL, schema)
			if err != nil {
				t.Fatal(err)
			}
			if legacy {
				legacyDB, err := gorm.Open(postgresDialector(isolatedURL), &gorm.Config{})
				if err != nil {
					t.Fatal(err)
				}
				for _, ddl := range schemaDDL("postgres") {
					if err := legacyDB.Exec(ddl).Error; err != nil {
						t.Fatal(err)
					}
				}
				if err := legacyDB.Exec("CREATE TABLE alembic_version(version_num VARCHAR(32) NOT NULL)").Error; err != nil {
					t.Fatal(err)
				}
				if err := legacyDB.Exec("INSERT INTO alembic_version VALUES (?)", baselineRevision).Error; err != nil {
					t.Fatal(err)
				}
				if sqlDB, err := legacyDB.DB(); err == nil {
					_ = sqlDB.Close()
				}
			}
			db, err := OpenDatabase(isolatedURL)
			if err != nil {
				t.Fatal(err)
			}
			dbSQL, err := db.DB()
			if err != nil {
				t.Fatal(err)
			}
			defer dbSQL.Close()
			now := time.Now().UTC()
			room := Room{ID: "room", Code: "CODE", Name: "room", HostToken: "host", CardSet: JSONStrings{"1", "2"}, CreatedAt: now, UpdatedAt: now}
			if err := db.Create(&room).Error; err != nil {
				t.Fatal(err)
			}
			participant := Participant{ID: "participant", RoomID: room.ID, Name: "person", Token: "token", LastSeenAt: now, CreatedAt: now}
			issue := Issue{ID: "issue", RoomID: room.ID, Title: "task", CreatedAt: now}
			if err := db.Create(&participant).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&issue).Error; err != nil {
				t.Fatal(err)
			}
			vote := Vote{ID: "vote", RoomID: room.ID, IssueID: issue.ID, ParticipantID: participant.ID, Value: "3", CreatedAt: now, UpdatedAt: now}
			if err := db.Create(&vote).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Exec("INSERT INTO votes(id,room_id,issue_id,participant_id,value,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(issue_id,participant_id) DO UPDATE SET value=excluded.value", "vote2", room.ID, issue.ID, participant.ID, "5", now, now).Error; err != nil {
				t.Fatal(err)
			}
			var saved Vote
			if err := db.First(&saved, "issue_id = ? AND participant_id = ?", issue.ID, participant.ID).Error; err != nil || saved.Value != "5" {
				t.Fatalf("vote upsert: %#v, err=%v", saved, err)
			}
			if err := db.Delete(&room).Error; err != nil {
				t.Fatal(err)
			}
			var count int64
			db.Model(&Vote{}).Count(&count)
			if count != 0 {
				t.Fatalf("room cascade left %d votes", count)
			}
		})
	}
}

func postgresDialector(raw string) gorm.Dialector {
	u := strings.Replace(raw, "postgresql+psycopg://", "postgres://", 1)
	u = strings.Replace(u, "postgresql://", "postgres://", 1)
	return postgres.Open(u)
}

func postgresSchemaURL(raw, schema string) (string, error) {
	u := strings.Replace(raw, "postgresql+psycopg://", "postgres://", 1)
	u = strings.Replace(u, "postgresql://", "postgres://", 1)
	parsed, err := url.Parse(u)
	if err != nil {
		return "", err
	}
	q := parsed.Query()
	q.Set("search_path", schema)
	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

func TestLegacyUnversionedAndBaselineDatabases(t *testing.T) {
	for _, withVersion := range []bool{false, true} {
		t.Run(map[bool]string{false: "unversioned", true: "baseline"}[withVersion], func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "old.db")
			db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
			if err != nil {
				t.Fatal(err)
			}
			ddl := []string{
				"CREATE TABLE rooms (id VARCHAR(36) PRIMARY KEY, code VARCHAR(16) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, host_token VARCHAR(255) NOT NULL UNIQUE, card_set JSON NOT NULL, revealed BOOLEAN NOT NULL, active_issue_id VARCHAR(36), created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)",
				"CREATE TABLE issues (id VARCHAR(36) PRIMARY KEY, room_id VARCHAR(36) NOT NULL, title VARCHAR(500) NOT NULL, description TEXT NOT NULL, link VARCHAR(2048) NOT NULL, position INTEGER NOT NULL, estimate VARCHAR(64), archived_at TIMESTAMP, created_at TIMESTAMP NOT NULL)",
				"CREATE TABLE participants (id VARCHAR(36) PRIMARY KEY, room_id VARCHAR(36) NOT NULL, name VARCHAR(255) NOT NULL, token VARCHAR(255) NOT NULL UNIQUE, is_spectator BOOLEAN NOT NULL, last_seen_at TIMESTAMP NOT NULL, created_at TIMESTAMP NOT NULL)",
				"CREATE TABLE votes (id VARCHAR(36) PRIMARY KEY, room_id VARCHAR(36) NOT NULL, issue_id VARCHAR(36) NOT NULL, participant_id VARCHAR(36) NOT NULL, value VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)",
			}
			for _, s := range ddl {
				if err := db.Exec(s).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := db.Exec("INSERT INTO rooms(id,code,name,host_token,card_set,revealed,created_at,updated_at) VALUES ('r','c','kept','secret','[\"1\"]',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").Error; err != nil {
				t.Fatal(err)
			}
			if withVersion {
				if err := db.Exec("CREATE TABLE alembic_version(version_num VARCHAR(32) NOT NULL)").Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Exec("INSERT INTO alembic_version VALUES (?)", baselineRevision).Error; err != nil {
					t.Fatal(err)
				}
			}
			db, err = OpenDatabase(sqliteURL(path))
			if err != nil {
				t.Fatal(err)
			}
			var got Room
			if err := db.First(&got, "id='r'").Error; err != nil {
				t.Fatal(err)
			}
			if got.Name != "kept" || got.OwnerID != nil {
				t.Fatalf("legacy data changed: %#v", got)
			}
			var rev string
			if err := db.Raw("SELECT version_num FROM alembic_version").Scan(&rev).Error; err != nil || rev != headRevision {
				t.Fatalf("revision %q, err %v", rev, err)
			}
		})
	}
}

func TestUnknownRevisionRejected(t *testing.T) {
	path := filepath.Join(t.TempDir(), "unknown.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE alembic_version(version_num VARCHAR(32) NOT NULL)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO alembic_version VALUES ('future_revision')").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := OpenDatabase(sqliteURL(path)); err == nil {
		t.Fatal("expected unknown revision to be refused")
	}
}

func TestMemoryDatabasesArePrivate(t *testing.T) {
	first, err := OpenDatabase("sqlite:///:memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(first)
	second, err := OpenDatabase("sqlite:///:memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(second)
	if err := first.Create(&Room{ID: "private", Code: "P", Name: "private", HostToken: "secret", CardSet: JSONStrings{}, CreatedAt: time.Now(), UpdatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := second.Model(&Room{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("independent memory database contains %d unexpected rooms", count)
	}
}

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
	var issue Issue
	if err := db.First(&issue, "id = ?", "i").Error; err != nil {
		t.Fatal(err)
	}
	var vote Vote
	if err := db.First(&vote, "id = ?", "v").Error; err != nil {
		t.Fatal(err)
	}
	if got := formatISO(issue.CreatedAt); got != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("issue timestamp %q", got)
	}
	if got := formatISO(vote.CreatedAt); got != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("vote timestamp %q", got)
	}
	if got := formatISO(vote.UpdatedAt); got != "2026-03-02T10:20:30Z" {
		t.Fatalf("whole-second timestamp %q", got)
	}
}

func TestFormatISO(t *testing.T) {
	input := time.Date(2026, 3, 2, 12, 20, 30, 123456789, time.FixedZone("offset", 2*60*60))
	if got := formatISO(input); got != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("fractional UTC timestamp %q", got)
	}
	whole := time.Date(2026, 3, 2, 10, 20, 30, 0, time.UTC)
	if got := formatISO(whole); got != "2026-03-02T10:20:30Z" {
		t.Fatalf("whole-second UTC timestamp %q", got)
	}
}

func TestIssueVoteJSONTimestamps(t *testing.T) {
	now := time.Date(2026, 3, 2, 10, 20, 30, 123456000, time.UTC)
	issueJSON, err := json.Marshal(Issue{ID: "i", CreatedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	var issueFields map[string]json.RawMessage
	if err := json.Unmarshal(issueJSON, &issueFields); err != nil {
		t.Fatal(err)
	}
	var created string
	if err := json.Unmarshal(issueFields["created_at"], &created); err != nil || created != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("issue created_at=%q err=%v", created, err)
	}
	if string(issueFields["archived_at"]) != "null" {
		t.Fatalf("nil archived_at should remain null: %s", issueFields["archived_at"])
	}
	archived := now.Add(time.Second)
	issueJSON, err = json.Marshal(Issue{ID: "i", CreatedAt: now, ArchivedAt: &archived})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(issueJSON, &issueFields); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(issueFields["archived_at"], &created); err != nil || created != "2026-03-02T10:20:31.123456Z" {
		t.Fatalf("archived_at=%q err=%v", created, err)
	}
	vote, err := json.Marshal(Vote{ID: "v", CreatedAt: now, UpdatedAt: now.Add(time.Second)})
	if err != nil {
		t.Fatal(err)
	}
	var voteFields map[string]json.RawMessage
	if err := json.Unmarshal(vote, &voteFields); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(voteFields["updated_at"], &created); err != nil || created != "2026-03-02T10:20:31.123456Z" {
		t.Fatalf("vote updated_at=%q err=%v", created, err)
	}
}

func sqliteURL(path string) string {
	if filepath.IsAbs(path) {
		return "sqlite:////" + strings.TrimPrefix(path, "/")
	}
	return "sqlite:///" + path
}
