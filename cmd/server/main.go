// Command server is the zerxLabKit all-in-one binary: connectRPC API plus the
// embedded SPA, served over HTTP/1.1 and h2c.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zerx-lab/zerxlabkit/internal/config"
	"github.com/zerx-lab/zerxlabkit/internal/database"
	"github.com/zerx-lab/zerxlabkit/internal/server"
)

// version is overridden at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	logger := newLogger(cfg.Env)

	db, err := database.Open(cfg.DB, cfg.Env)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() {
		if sqlDB, derr := db.DB(); derr == nil {
			_ = sqlDB.Close()
		}
	}()

	if err := database.Migrate(db); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	if err := database.SeedAdmin(context.Background(), db, cfg, logger); err != nil {
		return fmt.Errorf("seed admin: %w", err)
	}

	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true) // h2c, for grpc tooling; SPA uses HTTP/1.1

	srv := &http.Server{
		Addr:              cfg.Server.Addr,
		Handler:           server.New(cfg, db, logger),
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server starting", "version", version, "addr", cfg.Server.Addr, "env", cfg.Env)
		if serveErr := srv.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			errCh <- serveErr
		}
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	case serveErr := <-errCh:
		return fmt.Errorf("serve: %w", serveErr)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}

	logger.Info("server stopped")

	return nil
}

func newLogger(env string) *slog.Logger {
	if env == "dev" {
		return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))
	}

	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
