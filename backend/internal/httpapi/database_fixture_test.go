package httpapi

import (
	"net/url"
	"path/filepath"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

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

func closeDatabase(db *gorm.DB) {
	if db != nil {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
}

func sqliteURL(path string) string {
	if filepath.IsAbs(path) {
		return "sqlite:////" + strings.TrimPrefix(path, "/")
	}
	return "sqlite:///" + path
}
