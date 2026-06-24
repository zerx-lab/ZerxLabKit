package casbin

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestSetAndEnforce(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	e, err := New(db)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if err := SetRoleProcedures(e, "editor", []string{"/p"}); err != nil {
		t.Fatalf("SetRoleProcedures: %v", err)
	}

	ok, err := e.Enforce("editor", "/p")
	if err != nil || !ok {
		t.Fatalf("Enforce(/p) = %v, %v; want true", ok, err)
	}
	ok, _ = e.Enforce("editor", "/q")
	if ok {
		t.Fatal("Enforce(/q) = true; want false")
	}

	procs, err := GetRoleProcedures(e, "editor")
	if err != nil || len(procs) != 1 || procs[0] != "/p" {
		t.Fatalf("GetRoleProcedures = %v, %v", procs, err)
	}

	if err := RemoveProcedure(e, "/p"); err != nil {
		t.Fatalf("RemoveProcedure: %v", err)
	}
	ok, _ = e.Enforce("editor", "/p")
	if ok {
		t.Fatal("Enforce(/p) after remove = true; want false")
	}
}
