package model

import (
	"time"

	"gorm.io/gorm"
)

// Role is an RBAC role keyed by a stable string Code (the business key used by
// User.Role, casbin subjects, and the role-* association tables). Code is
// immutable once created; only Name/Description/Sort are editable.
type Role struct {
	ID          uint64 `gorm:"primaryKey"`
	Code        string `gorm:"uniqueIndex;not null"`
	Name        string `gorm:"not null"`
	Description string
	Builtin     bool `gorm:"not null;default:false"`
	Sort        int
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}
