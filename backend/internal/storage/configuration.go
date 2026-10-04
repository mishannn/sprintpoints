package storage

import (
	"net/url"
	"os"
	"strings"
)

// DatabaseURLFromEnv prefers an explicit URL, then PostgreSQL settings, then local SQLite.
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
