package storage

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"slices"
	"strings"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
	"gorm.io/gorm"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func migrate(db *gorm.DB, dialect string) error {
	// One catalog snapshot prevents concurrent startup from mixing table states.
	tables, err := db.Migrator().GetTables()
	if err != nil {
		return err
	}
	if !slices.Contains(tables, "goose_db_version") && slices.ContainsFunc(tables, func(name string) bool {
		return dialect != "sqlite" || !strings.HasPrefix(name, "sqlite_")
	}) {
		return errors.New("target database contains unmanaged tables; explicit migration required")
	}
	fsys, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	gooseDialect := goose.Dialect(dialect)
	var opts []goose.ProviderOption
	if dialect == "postgres" {
		locker, err := lock.NewPostgresSessionLocker()
		if err != nil {
			return err
		}
		opts = append(opts, goose.WithSessionLocker(locker))
	} else {
		gooseDialect = "sqlite3"
	}
	provider, err := goose.NewProvider(gooseDialect, sqlDB, fsys, opts...)
	if err != nil {
		return err
	}
	_, err = provider.Up(context.Background())
	return err
}
