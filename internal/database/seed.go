package database

import (
	"context"
	"errors"
	"log/slog"

	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/internal/auth"
	"github.com/zerx-lab/zerxlabkit/internal/config"
	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// SeedAdmin ensures a bootstrap admin user exists. It is idempotent. Outside
// development it refuses to seed when the insecure default password is in use.
func SeedAdmin(ctx context.Context, db *gorm.DB, cfg *config.Config, logger *slog.Logger) error {
	if cfg.Env != "dev" && cfg.Seed.AdminPassword == config.DefaultAdminPassword {
		logger.Warn("refusing to seed admin with the default password outside dev; set SEED_ADMIN_PASSWORD")
		return nil
	}

	_, err := gorm.G[model.User](db).Where("email = ?", cfg.Seed.AdminEmail).First(ctx)
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	hash, err := auth.Hash(cfg.Seed.AdminPassword)
	if err != nil {
		return err
	}

	admin := model.User{
		Email:        cfg.Seed.AdminEmail,
		Name:         "Administrator",
		PasswordHash: hash,
		Role:         model.RoleAdmin,
	}
	if err := gorm.G[model.User](db).Create(ctx, &admin); err != nil {
		return err
	}

	logger.Info("seeded admin user", "email", cfg.Seed.AdminEmail)

	return nil
}
