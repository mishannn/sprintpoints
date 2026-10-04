package storage

import (
	"context"
	"embed"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
	"gorm.io/gorm"
)

//go:embed migrations/postgres/*.sql migrations/sqlite/*.sql
var migrationFiles embed.FS

func migrate(db *gorm.DB, dialect string) error {
	if dialect == "postgres" {
		// Check in one catalog snapshot so a concurrent first migration is never
		// mistaken for an unmanaged schema between separate inspection queries.
		var count int64
		err := db.Raw(`SELECT count(*) FROM information_schema.tables t
			WHERE t.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
			AND t.table_name <> 'goose_db_version'
			AND NOT EXISTS (
				SELECT 1 FROM information_schema.tables v
				WHERE v.table_schema = current_schema() AND v.table_name = 'goose_db_version'
			)`).Scan(&count).Error
		if err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("target schema contains unmanaged tables; explicit migration required")
		}
	} else {
		var managed int64
		if err := db.Raw(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='goose_db_version'`).Scan(&managed).Error; err != nil {
			return err
		}
		if managed == 0 {
			var count int64
			if err := db.Raw(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return fmt.Errorf("target database contains unmanaged tables; explicit migration required")
			}
		}
	}
	return runGoose(db, dialect)
}

func runGoose(db *gorm.DB, dialect string) error {
	fsys, err := fs.Sub(migrationFiles, "migrations/"+dialect)
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
