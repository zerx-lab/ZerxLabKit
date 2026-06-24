package model

import (
	"time"

	"gorm.io/gorm"
)

// Dictionary is a named lookup set (e.g. "gender") keyed by Type.
type Dictionary struct {
	ID          uint64 `gorm:"primaryKey"`
	Type        string `gorm:"uniqueIndex;not null"`
	Name        string
	Description string
	Status      bool `gorm:"not null;default:true"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

// DictionaryItem is a label/value entry within a Dictionary.
type DictionaryItem struct {
	ID        uint64 `gorm:"primaryKey"`
	DictID    uint64 `gorm:"index;not null"`
	Label     string
	Value     string
	Sort      int
	Status    bool `gorm:"not null;default:true"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}
