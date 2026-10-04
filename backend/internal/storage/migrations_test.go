package storage

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mishannn/sprintpoints/backend/internal/domain"

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
	if err := db.Create(&domain.Room{ID: "r1", Code: "C", Name: "Room", HostToken: "secret", CardSet: domain.JSONStrings{"1", "2"}, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := OpenDatabase(sqliteURL(path)); err != nil {
		t.Fatal(err)
	}
	var got domain.Room
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
			room := domain.Room{ID: "room", Code: "CODE", Name: "room", HostToken: "host", CardSet: domain.JSONStrings{"1", "2"}, CreatedAt: now, UpdatedAt: now}
			if err := db.Create(&room).Error; err != nil {
				t.Fatal(err)
			}
			participant := domain.Participant{ID: "participant", RoomID: room.ID, Name: "person", Token: "token", LastSeenAt: now, CreatedAt: now}
			issue := domain.Issue{ID: "issue", RoomID: room.ID, Title: "task", CreatedAt: now}
			if err := db.Create(&participant).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&issue).Error; err != nil {
				t.Fatal(err)
			}
			vote := domain.Vote{ID: "vote", RoomID: room.ID, IssueID: issue.ID, ParticipantID: participant.ID, Value: "3", CreatedAt: now, UpdatedAt: now}
			if err := db.Create(&vote).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Exec("INSERT INTO votes(id,room_id,issue_id,participant_id,value,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(issue_id,participant_id) DO UPDATE SET value=excluded.value", "vote2", room.ID, issue.ID, participant.ID, "5", now, now).Error; err != nil {
				t.Fatal(err)
			}
			var saved domain.Vote
			if err := db.First(&saved, "issue_id = ? AND participant_id = ?", issue.ID, participant.ID).Error; err != nil || saved.Value != "5" {
				t.Fatalf("vote upsert: %#v, err=%v", saved, err)
			}
			if err := db.Delete(&room).Error; err != nil {
				t.Fatal(err)
			}
			var count int64
			db.Model(&domain.Vote{}).Count(&count)
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
			var got domain.Room
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
	if err := first.Create(&domain.Room{ID: "private", Code: "P", Name: "private", HostToken: "secret", CardSet: domain.JSONStrings{}, CreatedAt: time.Now(), UpdatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := second.Model(&domain.Room{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("independent memory database contains %d unexpected rooms", count)
	}
}

func sqliteURL(path string) string {
	if filepath.IsAbs(path) {
		return "sqlite:////" + strings.TrimPrefix(path, "/")
	}
	return "sqlite:///" + path
}
