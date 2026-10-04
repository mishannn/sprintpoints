package storage

import (
	"net"
	"net/url"
	"os"
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
		connection := url.URL{
			Scheme:  "postgresql",
			User:    url.UserPassword(user, pass),
			Host:    net.JoinHostPort(host, port),
			Path:    "/" + db,
			RawPath: "/" + url.PathEscape(db),
		}
		return connection.String()
	}
	return "sqlite:///./sprintpoints.sqlite3"
}
