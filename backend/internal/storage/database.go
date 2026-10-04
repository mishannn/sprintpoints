package storage

import (
	"fmt"
	"net/url"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// OpenDatabase opens the configured GORM database and applies known schema revisions.
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
		return postgres.Open(parsed.String()), "postgres", nil
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
