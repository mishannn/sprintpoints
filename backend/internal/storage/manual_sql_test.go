package storage_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Each test substitutes isolated schemas into the exact one-statement script;
// no test writes to the database's real public or sprintpoints schemas.
func TestManualPostgresImport(t *testing.T) {
	raw := os.Getenv("TEST_POSTGRES_URL")
	if raw == "" {
		t.Skip("TEST_POSTGRES_URL is not set")
	}
	db, err := gorm.Open(postgres.Open(raw), &gorm.Config{})
	if err != nil {
		t.Fatal("connect test PostgreSQL:", err)
	}
	conn, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	script, err := os.ReadFile(filepath.Join("..", "..", "..", "ops", "database", "migrate-from-public.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		mutate string
		fail   bool
	}{
		{"copy", "", false},
		{"bad-room-reference", `UPDATE %s.votes SET room_id = 'missing'`, true},
		{"duplicate-token", `INSERT INTO %s.participants VALUES ('p2','r','Other','member-secret',false,'2025-01-02 03:04:05','2025-01-02 03:04:05')`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			suffix := fmt.Sprint(time.Now().UnixNano())
			source, target := "manual_legacy_"+suffix, "manual_native_"+suffix
			for _, schema := range []string{source, target} {
				defer db.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`)
			}
			if err := db.Exec(`CREATE SCHEMA "` + source + `"`).Error; err != nil {
				t.Fatal(err)
			}
			for _, statement := range []string{
				`CREATE TABLE rooms(id varchar(36) primary key,code varchar(16),name varchar(255),host_token varchar(255),owner_id varchar(36),card_set json,revealed boolean,active_issue_id varchar(36),created_at timestamp,updated_at timestamp)`,
				`CREATE TABLE participants(id varchar(36) primary key,room_id varchar(36),name varchar(255),token varchar(255),is_spectator boolean,last_seen_at timestamp,created_at timestamp)`,
				`CREATE TABLE issues(id varchar(36) primary key,room_id varchar(36),title varchar(500),description text,link varchar(2048),position integer,estimate varchar(64),archived_at timestamp,created_at timestamp)`,
				`CREATE TABLE votes(id varchar(36) primary key,room_id varchar(36),issue_id varchar(36),participant_id varchar(36),value varchar(64),created_at timestamp,updated_at timestamp)`,
				`CREATE TABLE alembic_version(version_num varchar(32))`,
			} {
				statement = strings.Replace(statement, "CREATE TABLE ", `CREATE TABLE "`+source+`".`, 1)
				if err := db.Exec(statement).Error; err != nil {
					t.Fatal(err)
				}
			}
			for _, statement := range []string{
				`INSERT INTO %s.rooms VALUES ('r','ROOM','Planning','host-secret','p','["1","2","?"]',false,'i','2025-01-02 03:04:05','2025-01-02 03:04:05')`,
				`INSERT INTO %s.participants VALUES ('p','r','Owner','member-secret',false,'2025-01-02 03:04:05','2025-01-02 03:04:05')`,
				`INSERT INTO %s.issues VALUES ('i','r','Issue','','',0,'2',NULL,'2025-01-02 03:04:05')`,
				`INSERT INTO %s.votes VALUES ('v','r','i','p','2','2025-01-02 03:04:05','2025-01-02 03:04:05')`,
				`INSERT INTO %s.alembic_version VALUES ('old')`,
			} {
				if err := db.Exec(fmt.Sprintf(statement, `"`+source+`"`)).Error; err != nil {
					t.Fatal(err)
				}
			}
			if tc.mutate != "" {
				if err := db.Exec(fmt.Sprintf(tc.mutate, `"`+source+`"`)).Error; err != nil {
					t.Fatal(err)
				}
			}
			statement := strings.ReplaceAll(string(script), "public.", `"`+source+`".`)
			statement = strings.ReplaceAll(statement, "'sprintpoints'", "'"+target+"'")
			statement = strings.ReplaceAll(statement, "sprintpoints.", `"`+target+`".`)
			statement = strings.ReplaceAll(statement, "CREATE SCHEMA sprintpoints;", `CREATE SCHEMA "`+target+`";`)
			err := db.Exec(statement).Error
			if tc.fail {
				if err == nil {
					t.Fatal("bad legacy data imported")
				}
				var exists bool
				if e := db.Raw(`SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=?)`, target).Scan(&exists).Error; e != nil || exists {
					t.Fatalf("failed import left schema: exists=%t err=%v", exists, e)
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				var room struct {
					ID, Code, HostToken, OwnerID, ActiveIssueID string
					CreatedAt                                   time.Time
					CardSet                                     string
				}
				if e := db.Table(`"` + target + `".rooms`).First(&room).Error; e != nil {
					t.Fatal(e)
				}
				if room.ID != "r" || room.Code != "ROOM" || room.HostToken != "host-secret" || room.OwnerID != "p" || room.ActiveIssueID != "i" || room.CreatedAt.UTC().Format(time.RFC3339) != "2025-01-02T03:04:05Z" {
					t.Fatalf("copied room differs: %+v", room)
				}
				if e := db.Exec(statement).Error; e == nil || !strings.Contains(e.Error(), "already exists") {
					t.Fatalf("second import accepted: %v", e)
				}
			}
			var count int64
			if e := db.Table(`"` + source + `".alembic_version`).Count(&count).Error; e != nil || count != 1 {
				t.Fatalf("Alembic source changed: count=%d err=%v", count, e)
			}
			for _, table := range []string{"rooms", "issues", "votes", "participants"} {
				want := int64(1)
				if table == "participants" && tc.name == "duplicate-token" {
					want = 2
				}
				if e := db.Table(`"` + source + `".` + table).Count(&count).Error; e != nil || count != want {
					t.Fatalf("source %s changed: count=%d want=%d err=%v", table, count, want, e)
				}
			}
		})
	}
}
