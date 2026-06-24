package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Local stores blobs on the filesystem under dir, exposing them at baseURL.
type Local struct {
	dir     string
	baseURL string
}

// Save writes the reader to dir/key, creating parent directories.
func (l *Local) Save(_ context.Context, key string, r io.Reader, _ int64, _ string) error {
	dst := filepath.Join(l.dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}

	f, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer func() { _ = f.Close() }()

	if _, err := io.Copy(f, r); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

// Delete removes dir/key (missing file is not an error).
func (l *Local) Delete(_ context.Context, key string) error {
	if err := os.Remove(filepath.Join(l.dir, filepath.FromSlash(key))); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove file: %w", err)
	}

	return nil
}

// PublicURL returns the stable URL under baseURL for key.
func (l *Local) PublicURL(key string) string {
	return l.baseURL + "/" + key
}

// Open opens dir/key for reading, rejecting keys that escape dir.
func (l *Local) Open(_ context.Context, key string) (io.ReadSeekCloser, time.Time, error) {
	clean := filepath.Clean(filepath.FromSlash(key))
	if strings.Contains(clean, "..") {
		return nil, time.Time{}, fmt.Errorf("invalid key %q", key)
	}
	absDir, err := filepath.Abs(l.dir)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("abs dir: %w", err)
	}
	absPath, err := filepath.Abs(filepath.Join(absDir, clean))
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("abs path: %w", err)
	}
	if !strings.HasPrefix(absPath, absDir+string(os.PathSeparator)) {
		return nil, time.Time{}, fmt.Errorf("key %q escapes storage dir", key)
	}

	f, err := os.Open(absPath)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("open file: %w", err)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, time.Time{}, fmt.Errorf("stat file: %w", err)
	}

	return f, info.ModTime(), nil
}

// Presign is unused for local storage; media-layer HMAC signs local URLs.
func (l *Local) Presign(_ context.Context, _ string, _ time.Duration) (string, error) {
	return "", nil
}
