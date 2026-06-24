package database

import (
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// Migrate runs schema auto-migration for all models. Suitable for development
// and the scaffold; production deployments should adopt versioned migrations.
func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.User{},
		&model.Role{},
		&model.Menu{},
		&model.MenuButton{},
		&model.RoleMenu{},
		&model.RoleButton{},
		&model.API{},
		&model.Dictionary{},
		&model.DictionaryItem{},
		&model.OperationLog{},
		&model.LoginLog{},
		&model.UserSession{},
		&model.SysParam{},
		&model.File{},
	)
}
