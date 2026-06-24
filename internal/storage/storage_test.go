package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalSaveAndDelete(t *testing.T) {
	dir := t.TempDir()
	l := &Local{dir: dir, baseURL: "/uploads"}
	ctx := context.Background()

	url, err := l.Save(ctx, "2026/06/file.txt", strings.NewReader("hello"), 5, "text/plain")
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if url != "/uploads/2026/06/file.txt" {
		t.Errorf("url = %q", url)
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
