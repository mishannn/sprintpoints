package storage

import (
	"fmt"

	"gorm.io/gorm"
)

// Persisted revision identifiers are part of the existing database format.
// Keep them stable so upgrading a deployed database never resets migration state.
const baselineRevision = "0001_initial_schema"
const headRevision = "0002_add_rooms_owner_id"

// Migrations run in a transaction; PostgreSQL additionally serializes startup
// across service instances before inspecting or updating the revision table.
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
