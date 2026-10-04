package storage

import (
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var schemaNamePattern = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

// OpenDatabase opens the configured database and applies native schema migrations. For
// PostgreSQL, DATABASE_SCHEMA defaults to sprintpoints; a URL search_path takes precedence.
func OpenDatabase(rawURL string) (*gorm.DB, error) {
	schema := ""
	if strings.HasPrefix(rawURL, "postgres://") || strings.HasPrefix(rawURL, "postgresql://") {
		if parsed, err := url.Parse(rawURL); err == nil {
			schema = parsed.Query().Get("search_path")
		}
	}
	if schema == "" {
		schema = envSchema()
	}
	return OpenDatabaseInSchema(rawURL, schema)
}

// OpenDatabaseInSchema explicitly chooses the isolated PostgreSQL target schema.
func OpenDatabaseInSchema(rawURL, schema string) (*gorm.DB, error) {
	dialector, dialect, schema, err := openDialector(rawURL, schema)
	if err != nil {
		return nil, err
	}
	db, err := gorm.Open(dialector, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		closeDatabase(db)
		return nil, err
	}
	if dialect == "sqlite" {
		sqlDB.SetMaxOpenConns(1)
		if err = db.Exec("PRAGMA foreign_keys = ON").Error; err == nil {
			err = db.Exec("PRAGMA busy_timeout = 5000").Error
		}
	} else {
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext(?)::bigint)", "sprintpoints-schema-"+schema).Error; err != nil {
				return err
			}
			return tx.Exec(`CREATE SCHEMA IF NOT EXISTS "` + schema + `"`).Error
		})
	}
	if err == nil {
		err = migrate(db, dialect)
	}
	if err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return db, nil
}

func envSchema() string {
	if s := strings.TrimSpace(os.Getenv("DATABASE_SCHEMA")); s != "" {
		return s
	}
	return "sprintpoints"
}

func openDialector(raw, schema string) (gorm.Dialector, string, string, error) {
	if strings.HasPrefix(raw, "sqlite://") {
		path := strings.TrimPrefix(raw, "sqlite://")
		query := ""
		if i := strings.IndexByte(path, '?'); i >= 0 {
			query, path = path[i+1:], path[:i]
		}
		if strings.HasPrefix(path, "//") {
			path = path[1:]
		} else if strings.HasPrefix(path, "/") {
			path = strings.TrimPrefix(path, "/")
		}
		q, _ := url.ParseQuery(query)
		q.Set("_foreign_keys", "on")
		q.Set("_busy_timeout", "5000")
		return sqlite.Open(path + "?" + q.Encode()), "sqlite", "", nil
	}
	if strings.HasPrefix(raw, "postgres://") || strings.HasPrefix(raw, "postgresql://") {
		if schema == "" {
			schema = envSchema()
		}
		if !schemaNamePattern.MatchString(schema) || schema == "public" || strings.HasPrefix(schema, "pg_") {
			return nil, "", "", fmt.Errorf("invalid DATABASE_SCHEMA %q: use a lowercase identifier, excluding public and pg_* schemas", schema)
		}
		u, err := url.Parse(raw)
		if err != nil {
			return nil, "", "", err
		}
		q := u.Query()
		q.Set("search_path", schema)
		if q.Get("timezone") == "" {
			q.Set("timezone", "UTC")
		}
		u.RawQuery = q.Encode()
		return postgres.Open(u.String()), "postgres", schema, nil
	}
	return nil, "", "", fmt.Errorf("unsupported database URL scheme")
}

func closeDatabase(db *gorm.DB) {
	if db == nil {
		return
	}
	if sqlDB, err := db.DB(); err == nil {
		_ = sqlDB.Close()
	}
}
