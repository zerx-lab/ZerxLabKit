package model

import (
	"time"

	"gorm.io/gorm"
)

// SysParam is a runtime-tunable system parameter keyed by Key (immutable).
type SysParam struct {
	ID          uint64 `gorm:"primaryKey"`
	Key         string `gorm:"uniqueIndex;not null"`
	Name        string
	Value       string `gorm:"type:text"`
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}
