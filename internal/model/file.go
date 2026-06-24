package model

import (
	"time"

	"gorm.io/gorm"
)

// Visibility levels for an uploaded file.
const (
	VisibilityPublic        = "public"
	VisibilityAuthenticated = "authenticated"
	VisibilityPrivate       = "private"
)

// File is an uploaded blob's metadata; the blob itself lives in storage.
type File struct {
	ID          uint64 `gorm:"primaryKey"`
	Name        string
	Key         string `gorm:"uniqueIndex;not null"`
	URL         string
	Size        int64
	ContentType string
	Visibility  string `gorm:"not null;default:'private'"`
	UploadedBy  uint64 `gorm:"index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}
