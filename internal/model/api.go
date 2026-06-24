package model

import (
	"time"

	"gorm.io/gorm"
)

// API is a catalog entry for one connectRPC procedure, used by the RBAC API
// management UI and synced from the compiled proto descriptors.
type API struct {
	ID          uint64 `gorm:"primaryKey"`
	Procedure   string `gorm:"uniqueIndex;not null"`
	Service     string
	Method      string
	Description string
	Group       string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}
