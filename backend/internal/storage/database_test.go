package storage

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

func TestSQLiteFreshMigrationAndIdempotency(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fresh.db")
	db, err := OpenDatabase(sqliteURL(path))
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(db)
	var version int64
	if err := db.Raw("SELECT version_id FROM goose_db_version WHERE is_applied=1 ORDER BY id DESC LIMIT 1").Scan(&version).Error; err != nil || version != 1 {
		t.Fatalf("native migration version=%d err=%v", version, err)
	}
	var ownerColumn int64
	if err := db.Raw("SELECT count(*) FROM pragma_table_info('rooms') WHERE name='owner_id'").Scan(&ownerColumn).Error; err != nil || ownerColumn != 1 {
		t.Fatalf("owner_id missing, count=%d err=%v", ownerColumn, err)
	}
	now := time.Now().UTC()
	room := domain.Room{ID: "r", Code: "C", Name: "Room", HostToken: "secret", CardSet: []string{"1", "2"}, CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&room).Error; err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenDatabase(sqliteURL(path))
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(reopened)
	var got domain.Room
	if err := reopened.First(&got, "id = ?", "r").Error; err != nil || len(got.CardSet) != 2 {
		t.Fatalf("room not preserved: %#v err=%v", got, err)
	}
	stamp := time.Now().UTC()
	for _, row := range []struct {
		sql  string
		args []any
	}{
		{"INSERT INTO issues(id,room_id,title,description,link,position,created_at) VALUES('i','r','task','','',0,?)", []any{stamp}},
		{"INSERT INTO participants(id,room_id,name,token,is_spectator,last_seen_at,created_at) VALUES('p','r','person','token',0,?,?)", []any{stamp, stamp}},
		{"INSERT INTO votes(id,room_id,issue_id,participant_id,value,created_at,updated_at) VALUES('v','r','i','p','3',?,?)", []any{stamp, stamp}},
	} {
		if err := reopened.Exec(row.sql, row.args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := reopened.Exec("INSERT INTO votes(id,room_id,issue_id,participant_id,value,created_at,updated_at) VALUES('v2','r','i','p','5',?,?) ON CONFLICT(issue_id,participant_id) DO UPDATE SET value=excluded.value", stamp, stamp).Error; err != nil {
		t.Fatal(err)
	}
	var value string
	if err := reopened.Raw("SELECT value FROM votes WHERE issue_id='i' AND participant_id='p'").Scan(&value).Error; err != nil || value != "5" {
		t.Fatalf("vote upsert=%q err=%v", value, err)
	}
	if err := reopened.Exec("INSERT INTO votes(id,room_id,issue_id,participant_id,value,created_at,updated_at) VALUES('bad','missing','missing','missing','5',?,?)", stamp, stamp).Error; err == nil {
		t.Fatal("foreign key violation accepted")
	}
	if err := reopened.Exec("DELETE FROM rooms WHERE id='r'").Error; err != nil {
		t.Fatal(err)
	}
	var votes int64
	if err := reopened.Raw("SELECT count(*) FROM votes").Scan(&votes).Error; err != nil || votes != 0 {
		t.Fatalf("room cascade left %d votes, err=%v", votes, err)
	}
}

func TestSQLiteUnmanagedTargetRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "unmanaged.db")
	setup, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := setup.Exec("CREATE TABLE keep_me(id INTEGER)").Error; err != nil {
		t.Fatal(err)
	}
	closeDatabase(setup)
	if _, err := OpenDatabase(sqliteURL(path)); err == nil || !strings.Contains(err.Error(), "unmanaged") {
		t.Fatalf("expected unmanaged target refusal, got %v", err)
	}
}

func TestSQLiteMemoryDatabasesArePrivate(t *testing.T) {
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
	var count int64
	if err := second.Model(&domain.Room{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("independent database count=%d err=%v", count, err)
	}
	if err := first.Create(&domain.Room{ID: "x", Code: "X", Name: "x", HostToken: "h", CardSet: []string{}, CreatedAt: time.Now(), UpdatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	if err := second.Model(&domain.Room{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("independent database count=%d err=%v", count, err)
	}
}

func TestPostgresDefaultAndCustomSchemaConcurrency(t *testing.T) {
	base := os.Getenv("TEST_POSTGRES_URL")
	if base == "" {
		t.Skip("TEST_POSTGRES_URL is not set")
	}
	t.Setenv("DATABASE_SCHEMA", "")
	base = withoutSearchPath(base)
	admin, err := gorm.Open(postgres.Open(normalizePostgresURL(base)), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { closeDatabase(admin) })
	var exists bool
	if err := admin.Raw("SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name='sprintpoints')").Scan(&exists).Error; err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Skip("sprintpoints schema already exists; refusing to modify it in test")
	}
	t.Cleanup(func() { _ = admin.Exec("DROP SCHEMA sprintpoints CASCADE").Error })
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			db, e := OpenDatabase(base)
			if e == nil {
				closeDatabase(db)
			}
			errs <- e
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	defaultDB, err := OpenDatabase(base)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(defaultDB)
	var current string
	if err := defaultDB.Raw("SELECT current_schema()").Scan(&current).Error; err != nil || current != "sprintpoints" {
		t.Fatalf("default current_schema=%q err=%v", current, err)
	}
	var publicRooms int64
	if err := admin.Raw("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='rooms'").Scan(&publicRooms).Error; err != nil || publicRooms != 0 {
		t.Fatalf("public rooms=%d err=%v", publicRooms, err)
	}
	var ledger int64
	if err := defaultDB.Raw("SELECT count(*) FROM goose_db_version WHERE version_id=1 AND is_applied").Scan(&ledger).Error; err != nil || ledger != 1 {
		t.Fatalf("default migration ledger=%d err=%v", ledger, err)
	}
	custom := fmt.Sprintf("storage_test_%d", os.Getpid())
	customDB, err := OpenDatabaseInSchema(base, custom)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(customDB)
	t.Cleanup(func() { _ = admin.Exec(`DROP SCHEMA "` + custom + `" CASCADE`).Error })
	if err := customDB.Raw("SELECT current_schema()").Scan(&current).Error; err != nil || current != custom {
		t.Fatalf("custom current_schema=%q err=%v", current, err)
	}
	var customLedger int64
	if err := customDB.Raw("SELECT count(*) FROM goose_db_version WHERE version_id=1 AND is_applied").Scan(&customLedger).Error; err != nil || customLedger != 1 {
		t.Fatalf("custom migration ledger=%d err=%v", customLedger, err)
	}
}

func TestPostgresUnmanagedTargetRefused(t *testing.T) {
	base := os.Getenv("TEST_POSTGRES_URL")
	if base == "" {
		t.Skip("TEST_POSTGRES_URL is not set")
	}
	admin, err := gorm.Open(postgres.Open(normalizePostgresURL(base)), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { closeDatabase(admin) })
	schema := fmt.Sprintf("storage_unmanaged_%d", os.Getpid())
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`).Error })
	if err := admin.Exec(`CREATE TABLE "` + schema + `".keep_me(id integer)`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := OpenDatabaseInSchema(base, schema); err == nil || !strings.Contains(err.Error(), "unmanaged") {
		t.Fatalf("expected unmanaged target refusal, got %v", err)
	}
}

func TestSchemaNameValidation(t *testing.T) {
	for _, schema := range []string{"public", "pg_catalog", "Bad", "two.parts", strings.Repeat("a", 64)} {
		if _, _, _, err := openDialector("postgres://localhost/test", schema); err == nil {
			t.Errorf("schema %q should be rejected", schema)
		}
	}
	if _, _, _, err := openDialector("postgres://localhost/test", "safe_schema_1"); err != nil {
		t.Fatalf("valid schema rejected: %v", err)
	}
}

func TestDatabaseURLFromEnvDefault(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_DB", "")
	t.Setenv("POSTGRES_USER", "")
	t.Setenv("POSTGRES_PASSWORD", "")
	if got := DatabaseURLFromEnv(); !strings.Contains(filepath.Base(got), "sprintpoints.sqlite3") {
		t.Fatalf("default URL=%q", got)
	}
}

func sqliteURL(path string) string {
	if filepath.IsAbs(path) {
		return "sqlite:////" + strings.TrimPrefix(path, "/")
	}
	return "sqlite:///" + path
}
func normalizePostgresURL(raw string) string {
	if strings.HasPrefix(raw, "postgresql://") {
		return "postgres://" + strings.TrimPrefix(raw, "postgresql://")
	}
	return raw
}
func withoutSearchPath(raw string) string {
	u, err := url.Parse(normalizePostgresURL(raw))
	if err != nil {
		return raw
	}
	q := u.Query()
	q.Del("search_path")
	u.RawQuery = q.Encode()
	return u.String()
}
