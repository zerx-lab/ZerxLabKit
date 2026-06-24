package model

import "time"

// PasswordResetToken backs the forgot-password flow. Only the SHA-256 hash of
// the emailed token is stored; tokens are single-use and time-limited.
type PasswordResetToken struct {
	ID        uint64    `gorm:"primaryKey"`
	TokenHash string    `gorm:"uniqueIndex;not null"`
	UserID    uint64    `gorm:"index;not null"`
	ExpiresAt time.Time `gorm:"not null"`
	UsedAt    *time.Time
	CreatedAt time.Time
}

// PasswordHistory records prior password hashes so the policy can forbid reuse.
type PasswordHistory struct {
	ID           uint64 `gorm:"primaryKey"`
	UserID       uint64 `gorm:"index;not null"`
	PasswordHash string `gorm:"not null"`
	CreatedAt    time.Time
}
