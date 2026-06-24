package database

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/internal/model"
)

func newSeededDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := Seed(db); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return db
}

func countMenusByName(t *testing.T, db *gorm.DB, name string) int64 {
	t.Helper()
	var n int64
	if err := db.Model(&model.Menu{}).Where("name = ?", name).Count(&n).Error; err != nil {
		t.Fatalf("count menu %q: %v", name, err)
	}
	return n
}

func TestSyncMenusReinsertsMissingAndIsIdempotent(t *testing.T) {
	db := newSeededDB(t)

	// Simulate a menu added to seedMenuTree after the DB was initialized.
	if err := db.Unscoped().Where("name = ?", "files").Delete(&model.Menu{}).Error; err != nil {
		t.Fatalf("delete files menu: %v", err)
	}
	if countMenusByName(t, db, "files") != 0 {
		t.Fatal("files menu not deleted")
	}

	if err := syncMenus(db); err != nil {
		t.Fatalf("syncMenus: %v", err)
	}

	var files model.Menu
	if err := db.Where("name = ?", "files").First(&files).Error; err != nil {
		t.Fatalf("files menu missing after sync: %v", err)
	}
	var system model.Menu
	if err := db.Where("name = ?", "system").First(&system).Error; err != nil {
		t.Fatalf("system menu missing: %v", err)
	}
	if files.ParentID != system.ID {
		t.Fatalf("files ParentID = %d, want system ID %d", files.ParentID, system.ID)
	}
	var grants int64
	if err := db.Model(&model.RoleMenu{}).Where("role_code = ? AND menu_id = ?", model.RoleAdmin, files.ID).Count(&grants).Error; err != nil {
		t.Fatalf("count admin grant: %v", err)
	}
	if grants != 1 {
		t.Fatalf("admin RoleMenu count = %d, want 1", grants)
	}

	// Idempotent: a second run inserts nothing.
	if err := syncMenus(db); err != nil {
		t.Fatalf("syncMenus second run: %v", err)
	}
	if got := countMenusByName(t, db, "files"); got != 1 {
		t.Fatalf("files menu count after second sync = %d, want 1", got)
	}
}

func TestSyncMenusReinsertsMissingButton(t *testing.T) {
	db := newSeededDB(t)

	if err := db.Unscoped().Where("code = ?", "user:reset").Delete(&model.MenuButton{}).Error; err != nil {
		t.Fatalf("delete button: %v", err)
	}

	if err := syncMenus(db); err != nil {
		t.Fatalf("syncMenus: %v", err)
	}

	var btn model.MenuButton
	if err := db.Where("code = ?", "user:reset").First(&btn).Error; err != nil {
		t.Fatalf("button missing after sync: %v", err)
	}
	var grants int64
	if err := db.Model(&model.RoleButton{}).Where("role_code = ? AND button_id = ?", model.RoleAdmin, btn.ID).Count(&grants).Error; err != nil {
		t.Fatalf("count admin grant: %v", err)
	}
	if grants != 1 {
		t.Fatalf("admin RoleButton count = %d, want 1", grants)
	}
}

func TestSyncMenusPreservesExistingEdits(t *testing.T) {
	db := newSeededDB(t)

	if err := db.Model(&model.Menu{}).Where("name = ?", "users").Update("title", "custom.title").Error; err != nil {
		t.Fatalf("edit menu: %v", err)
	}

	if err := syncMenus(db); err != nil {
		t.Fatalf("syncMenus: %v", err)
	}

	var users model.Menu
	if err := db.Where("name = ?", "users").First(&users).Error; err != nil {
		t.Fatalf("users menu missing: %v", err)
	}
	if users.Title != "custom.title" {
		t.Fatalf("users Title = %q, want custom.title (sync must not overwrite)", users.Title)
	}
}
