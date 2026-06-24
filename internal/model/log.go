package model

import "time"

// OperationLog is an append-only record of a mutating or failed RPC. Rows with
// Status != "ok" double as the error log (no separate table).
type OperationLog struct {
	ID        uint64    `gorm:"primaryKey"`
	CreatedAt time.Time `gorm:"index"`
	UserID    uint64    `gorm:"index"`
	UserEmail string
	Procedure string `gorm:"index"`
	Method    string
	IP        string
	UserAgent string
	LatencyMS int64
	Status    string `gorm:"index"`
	Error     string `gorm:"type:text"`
	Stack     string `gorm:"type:text"`
}

// LoginLog is an append-only record of a login attempt.
type LoginLog struct {
	ID        uint64    `gorm:"primaryKey"`
	CreatedAt time.Time `gorm:"index"`
	UserID    uint64    `gorm:"index"`
	Email     string    `gorm:"index"`
	IP        string
	UserAgent string
	Success   bool
	Error     string
}
