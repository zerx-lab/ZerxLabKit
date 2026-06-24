package storage

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalSaveAndDelete(t *testing.T) {
	dir := t.TempDir()
	l := &Local{dir: dir, baseURL: "/uploads"}
	ctx := context.Background()

	if err := l.Save(ctx, "2026/06/file.txt", strings.NewReader("hello"), 5, "text/plain"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if url := l.PublicURL("2026/06/file.txt"); url != "/uploads/2026/06/file.txt" {
		t.Errorf("PublicURL = %q", url)
	}

	got, err := os.ReadFile(filepath.Join(dir, "2026", "06", "file.txt"))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(got) != "hello" {
		t.Errorf("content = %q, want hello", got)
	}

	if err := l.Delete(ctx, "2026/06/file.txt"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "2026", "06", "file.txt")); !os.IsNotExist(err) {
		t.Error("file should be gone after Delete")
	}

	// Deleting a missing key is not an error.
	if err := l.Delete(ctx, "nope.txt"); err != nil {
		t.Errorf("Delete missing: %v", err)
	}
}

func TestLocalOpenAndTraversal(t *testing.T) {
	dir := t.TempDir()
	l := &Local{dir: dir, baseURL: "/uploads"}
	ctx := context.Background()

	if err := l.Save(ctx, "a/b.txt", strings.NewReader("world"), 5, "text/plain"); err != nil {
		t.Fatalf("Save: %v", err)
	}

	rc, _, err := l.Open(ctx, "a/b.txt")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = rc.Close() }()
	got, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(got) != "world" {
		t.Errorf("content = %q, want world", got)
	}

	if _, _, err := l.Open(ctx, "../etc/passwd"); err == nil {
		t.Error("Open should reject path traversal")
	}
}
