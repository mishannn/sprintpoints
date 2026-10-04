package poker

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const baselineRevision = "0001_initial_schema"
const headRevision = "0002_add_rooms_owner_id"

// DatabaseURLFromEnv mirrors the Python settings module's URL selection.
func DatabaseURLFromEnv() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	db, user, pass := os.Getenv("POSTGRES_DB"), os.Getenv("POSTGRES_USER"), os.Getenv("POSTGRES_PASSWORD")
	if db != "" && user != "" && pass != "" {
		host, port := os.Getenv("POSTGRES_HOST"), os.Getenv("POSTGRES_PORT")
		if host == "" {
			host = "localhost"
		}
		if port == "" {
			port = "5432"
		}
		return "postgresql://" + quoteURLPart(user) + ":" + quoteURLPart(pass) + "@" + host + ":" + port + "/" + quoteURLPart(db)
	}
	return "sqlite:///./planningpoker.sqlite3"
}

func quoteURLPart(s string) string { return strings.ReplaceAll(url.QueryEscape(s), "+", "%20") }

// OpenDatabase opens the configured GORM database and applies the two known
// schema revisions. It intentionally uses explicit DDL instead of AutoMigrate.
func OpenDatabase(databaseURL string) (*gorm.DB, error) {
	dialector, dialect, err := openDialector(databaseURL)
	if err != nil {
		return nil, err
	}
	db, err := gorm.Open(dialector, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		closeDatabase(db)
		return nil, err
	}
	if dialect == "sqlite" {
		sqlDB, e := db.DB()
		if e != nil {
			closeDatabase(db)
			return nil, e
		}
		sqlDB.SetMaxOpenConns(1)
		if err = db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
			_ = sqlDB.Close()
			return nil, err
		}
		if err = db.Exec("PRAGMA busy_timeout = 5000").Error; err != nil {
			_ = sqlDB.Close()
			return nil, err
		}
	}
	if err = migrate(db, dialect); err != nil {
		closeDatabase(db)
		return nil, err
	}
	return db, nil
}

func openDialector(raw string) (gorm.Dialector, string, error) {
	u := raw
	if strings.HasPrefix(u, "sqlite+pysqlite://") {
		u = strings.Replace(u, "sqlite+pysqlite://", "sqlite://", 1)
	}
	if strings.HasPrefix(u, "sqlite://") {
		path := strings.TrimPrefix(u, "sqlite://")
		query := ""
		if i := strings.IndexByte(path, '?'); i >= 0 {
			query, path = path[i+1:], path[:i]
		}
		if strings.HasPrefix(path, "//") { // sqlite:////absolute/path
			path = path[1:]
		} else if strings.HasPrefix(path, "/") { // sqlite:///relative/path
			path = strings.TrimPrefix(path, "/")
		}
		if path == ":memory:" {
			// Plain :memory: is private to each database handle.
		}
		query = appendQuery(query, "_foreign_keys=on&_busy_timeout=5000")
		if query != "" {
			path += "?" + query
		}
		return sqlite.Open(path), "sqlite", nil
	}
	if strings.HasPrefix(u, "postgresql+psycopg://") {
		u = strings.Replace(u, "postgresql+psycopg://", "postgres://", 1)
	}
	if strings.HasPrefix(u, "postgresql://") {
		u = strings.Replace(u, "postgresql://", "postgres://", 1)
	}
	if strings.HasPrefix(u, "postgres://") {
		parsed, err := url.Parse(u)
		if err != nil {
			return nil, "", err
		}
		q := parsed.Query()
		if q.Get("timezone") == "" {
			q.Set("timezone", "UTC")
		}
		parsed.RawQuery = q.Encode()
		u = parsed.String()
		return postgres.Open(u), "postgres", nil
	}
	return nil, "", fmt.Errorf("unsupported database URL scheme")
}

func appendQuery(existing, extra string) string {
	if existing == "" {
		return extra
	}
	return existing + "&" + extra
}

func closeDatabase(db *gorm.DB) {
	if db == nil {
		return
	}
	if sqlDB, err := db.DB(); err == nil {
		_ = sqlDB.Close()
	}
}

func migrate(db *gorm.DB, dialect string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		if dialect == "postgres" {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext('sprintpoints_schema_migration')::bigint)").Error; err != nil {
				return err
			}
		}
		exists, err := tableExists(tx, dialect, "alembic_version")
		if err != nil {
			return err
		}
		rooms, err := tableExists(tx, dialect, "rooms")
		if err != nil {
			return err
		}
		revision := ""
		if exists {
			var versions []string
			if err := tx.Raw("SELECT version_num FROM alembic_version").Scan(&versions).Error; err != nil {
				return err
			}
			if len(versions) != 1 {
				return fmt.Errorf("invalid alembic_version: expected one revision, found %d", len(versions))
			}
			revision = versions[0]
			if revision != baselineRevision && revision != headRevision {
				return fmt.Errorf("unsupported alembic revision %q", revision)
			}
		} else if rooms {
			revision = baselineRevision
		}
		if !rooms {
			if exists {
				return fmt.Errorf("alembic_version exists without rooms table")
			}
			for _, stmt := range schemaDDL(dialect) {
				if err := tx.Exec(stmt).Error; err != nil {
					return err
				}
			}
			if err := tx.Exec("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)").Error; err != nil {
				return err
			}
			if err := tx.Exec("INSERT INTO alembic_version(version_num) VALUES (?)", baselineRevision).Error; err != nil {
				return err
			}
			revision = baselineRevision
		} else if !exists {
			if err := tx.Exec("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)").Error; err != nil {
				return err
			}
			if err := tx.Exec("INSERT INTO alembic_version(version_num) VALUES (?)", baselineRevision).Error; err != nil {
				return err
			}
		}
		if revision == baselineRevision {
			hasOwner, err := columnExists(tx, dialect, "rooms", "owner_id")
			if err != nil {
				return err
			}
			if !hasOwner {
				if err := tx.Exec("ALTER TABLE rooms ADD COLUMN owner_id VARCHAR(36)").Error; err != nil {
					return err
				}
			}
			if err := tx.Exec("UPDATE alembic_version SET version_num = ?", headRevision).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func tableExists(tx *gorm.DB, dialect, table string) (bool, error) {
	var n int64
	var err error
	if dialect == "sqlite" {
		err = tx.Raw("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&n).Error
	} else {
		err = tx.Raw("SELECT count(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=?", table).Scan(&n).Error
	}
	return n > 0, err
}
func columnExists(tx *gorm.DB, dialect, table, col string) (bool, error) {
	var n int64
	var err error
	if dialect == "sqlite" {
		err = tx.Raw("SELECT count(*) FROM pragma_table_info(?) WHERE name=?", table, col).Scan(&n).Error
	} else {
		err = tx.Raw("SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=? AND column_name=?", table, col).Scan(&n).Error
	}
	return n > 0, err
}

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
