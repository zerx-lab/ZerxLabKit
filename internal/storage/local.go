package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Local stores blobs on the filesystem under dir, exposing them at baseURL.
type Local struct {
	dir     string
	baseURL string
}

// Save writes the reader to dir/key, creating parent directories.
func (l *Local) Save(_ context.Context, key string, r io.Reader, _ int64, _ string) (string, error) {
	dst := filepath.Join(l.dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	f, err := os.Create(dst)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer func() { _ = f.Close() }()

	if _, err := io.Copy(f, r); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	return l.baseURL + "/" + key, nil
}

// Delete removes dir/key (missing file is not an error).
func (l *Local) Delete(_ context.Context, key string) error {
	if err := os.Remove(filepath.Join(l.dir, filepath.FromSlash(key))); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove file: %w", err)
	}

	return nil
}
