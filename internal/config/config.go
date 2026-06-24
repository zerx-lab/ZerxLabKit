// Package config loads typed application configuration from the environment
// following 12-factor conventions. In dev it additionally sources a local .env.
package config

import (
	"os"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

// Config is the root application configuration.
type Config struct {
	Server ServerConfig
	DB     DBConfig
	JWT    JWTConfig
	Seed   SeedConfig
	Env    string `env:"APP_ENV" envDefault:"dev"`
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	Addr string `env:"SERVER_ADDR" envDefault:":8080"`
}

// DBConfig selects and configures the data source.
type DBConfig struct {
	Driver string `env:"DB_DRIVER" envDefault:"sqlite"`
	DSN    string `env:"DB_DSN" envDefault:"file:zerxlab.db?_journal_mode=WAL&_busy_timeout=5000&mode=rwc"`
}

// JWTConfig holds token signing configuration.
type JWTConfig struct {
	Secret     string        `env:"JWT_SECRET,required"`
	AccessTTL  time.Duration `env:"JWT_ACCESS_TTL" envDefault:"15m"`
	RefreshTTL time.Duration `env:"JWT_REFRESH_TTL" envDefault:"168h"`
}

// SeedConfig holds the bootstrap admin credentials.
type SeedConfig struct {
	AdminEmail    string `env:"SEED_ADMIN_EMAIL" envDefault:"admin@example.com"`
	AdminPassword string `env:"SEED_ADMIN_PASSWORD" envDefault:"admin12345"`
}

// DefaultAdminPassword is the insecure default; production seeding is skipped
// unless the operator overrides it.
const DefaultAdminPassword = "admin12345"

// Load reads configuration from the environment. Outside production it first
// loads a local .env file if one is present (missing file is not an error).
func Load() (*Config, error) {
	if appEnv := os.Getenv("APP_ENV"); appEnv == "" || appEnv == "dev" {
		_ = godotenv.Load()
	}

	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return nil, err
	}

	return &cfg, nil
}
