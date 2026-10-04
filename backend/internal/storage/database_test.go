package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestSQLiteConnectionUsesExplicitSchemaAndConnectionSettings(t *testing.T) {
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

	var tables int64
	if err := first.Raw("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='rooms'").Scan(&tables).Error; err != nil || tables != 0 {
		t.Fatalf("OpenDatabase created application tables: count=%d err=%v", tables, err)
	}
	var foreignKeys int
	if err := first.Raw("PRAGMA foreign_keys").Scan(&foreignKeys).Error; err != nil || foreignKeys != 1 {
		t.Fatalf("foreign_keys=%d err=%v", foreignKeys, err)
	}
	firstSQL, err := first.DB()
	if err != nil {
		t.Fatal(err)
	}
	if firstSQL.Stats().MaxOpenConnections != 1 {
		t.Fatalf("SQLite pool max connections=%d, want 1", firstSQL.Stats().MaxOpenConnections)
	}
	if err := first.Exec("CREATE TABLE connection_probe(id INTEGER PRIMARY KEY)").Error; err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := second.Raw("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='connection_probe'").Scan(&count).Error; err != nil || count != 0 {
		t.Fatalf("in-memory databases shared state: count=%d err=%v", count, err)
	}
}

func TestPostgresConnectionUsesExplicitSchema(t *testing.T) {
	baseURL := os.Getenv("TEST_POSTGRES_URL")
	if baseURL == "" {
		t.Skip("TEST_POSTGRES_URL is not set")
	}
	admin, err := gorm.Open(postgres.Open(normalizePostgresURL(baseURL)), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	adminSQL, err := admin.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer adminSQL.Close()

	schema := fmt.Sprintf("storage_test_%d", os.Getpid())
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`).Error })

	db, err := OpenDatabaseInSchema(baseURL, schema)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(db)
	var current string
	if err := db.Raw("SELECT current_schema()").Scan(&current).Error; err != nil || current != schema {
		t.Fatalf("current_schema=%q want %q err=%v", current, schema, err)
	}
	var tableCount int64
	if err := db.Raw("SELECT count(*) FROM information_schema.tables WHERE table_schema=?", schema).Scan(&tableCount).Error; err != nil || tableCount != 0 {
		t.Fatalf("OpenDatabase created tables in target schema: count=%d err=%v", tableCount, err)
	}
}

func TestPostgresSchemaNameValidation(t *testing.T) {
	for _, schema := range []string{"public", "pg_catalog", "Bad", "two.parts", "", strings.Repeat("a", 64)} {
		if schema == "" {
			continue // An omitted explicit schema uses DATABASE_SCHEMA/default.
		}
		if _, _, _, err := openDialector("postgres://localhost/test", schema); err == nil {
			t.Errorf("schema %q should be rejected", schema)
		}
	}
	if _, _, _, err := openDialector("postgres://localhost/test", "safe_schema_1"); err != nil {
		t.Fatalf("valid schema rejected: %v", err)
	}
}

func normalizePostgresURL(raw string) string {
	if strings.HasPrefix(raw, "postgresql://") {
		return "postgres://" + strings.TrimPrefix(raw, "postgresql://")
	}
	return raw
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
