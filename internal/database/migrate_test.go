package database

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	return db
}

// TestMigrateSucceedsAndIsIdempotent verifies that Migrate runs on a fresh
// in-memory SQLite and that a second call is a no-op (idempotent).
func TestMigrateSucceedsAndIsIdempotent(t *testing.T) {
	db := openTestDB(t)

	if err := Migrate(db, nil); err != nil {
		t.Fatalf("first Migrate: %v", err)
	}

	// Second run must not fail.
	if err := Migrate(db, nil); err != nil {
		t.Fatalf("second Migrate (idempotency): %v", err)
	}
}

// TestMigrateCreatesUserRolesTable checks that the user_roles table was created
// on a fresh database and that users.role column does NOT exist (it was only
// present in the old schema and is dropped by migration 0003).
func TestMigrateCreatesUserRolesTable(t *testing.T) {
	db := openTestDB(t)

	if err := Migrate(db, nil); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	if !db.Migrator().HasTable("user_roles") {
		t.Error("user_roles table not found after migrate")
	}

	if db.Migrator().HasColumn("users", "role") {
		t.Error("users.role column still exists after migrate (should have been dropped by 0003)")
	}
}
