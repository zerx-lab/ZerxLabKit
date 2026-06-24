package server

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/internal/config"
	"github.com/zerx-lab/zerxlabkit/internal/database"
)

func TestAssertServicesRegisteredDetectsMissing(t *testing.T) {
	err := assertServicesRegistered([]string{"/zerx.v1.UserService/"})
	if err == nil {
		t.Fatal("expected error for unregistered services, got nil")
	}
}

func TestNewRegistersAllServices(t *testing.T) {
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	cfg := &config.Config{}
	cfg.JWT.Secret = "test"
	cfg.Storage = config.StorageConfig{Driver: "local", LocalDir: t.TempDir(), LocalBaseURL: "/uploads"}
	cfg.Auth = config.AuthConfig{CaptchaThreshold: 2, LockThreshold: 5, LockFor: time.Minute}

	handler, err := New(cfg, db, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if handler == nil {
		t.Fatal("New returned nil handler")
	}
}
