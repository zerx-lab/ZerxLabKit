package model

import (
	"time"

	"gorm.io/gorm"
)

// Menu is a navigation node. A Menu with Path == "" is a non-clickable group
// heading; otherwise it is a leaf route.
type Menu struct {
	ID        uint64 `gorm:"primaryKey"`
	ParentID  uint64 `gorm:"index;not null;default:0"`
	Path      string
	Name      string `gorm:"not null"`
	Component string
	Title     string
	Icon      string
	Sort      int
	Hidden    bool `gorm:"not null;default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// MenuButton is a button-level permission marker attached to a menu. Code is by
// convention "<resource>:<action>" (e.g. user:create).
type MenuButton struct {
	ID        uint64 `gorm:"primaryKey"`
	MenuID    uint64 `gorm:"index;not null"`
	Code      string `gorm:"not null"`
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// RoleMenu associates a role (by code) with a visible menu.
type RoleMenu struct {
	RoleCode string `gorm:"primaryKey"`
	MenuID   uint64 `gorm:"primaryKey"`
}

// RoleButton associates a role (by code) with a granted button.
type RoleButton struct {
	RoleCode string `gorm:"primaryKey"`
	ButtonID uint64 `gorm:"primaryKey"`
}
