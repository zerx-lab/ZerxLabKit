package model

import (
	"time"

	"gorm.io/gorm"
)

// ScheduledJob is a cron-scheduled task registered in the DB. Handler must match
// a key in the in-process job registry; the UI only schedules registered handlers.
type ScheduledJob struct {
	ID          uint64 `gorm:"primaryKey"`
	Name        string `gorm:"uniqueIndex;not null"`
	Handler     string `gorm:"not null"`
	CronExpr    string `gorm:"not null"`
	Enabled     bool   `gorm:"not null;default:true"`
	Description string
	LastRunAt   *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

// JobExecution is an append-only record of one job run.
type JobExecution struct {
	ID         uint64    `gorm:"primaryKey"`
	JobID      uint64    `gorm:"index"`
	StartedAt  time.Time
	FinishedAt time.Time
	Status     string
	Error      string `gorm:"type:text"`
	DurationMS int64
}
