package model

import "time"

// LoginAttempt 是登录失败计数的共享窗口行,跨实例汇聚失败次数。窗口锚定首次失败,
// expires_at = first_at + LockFor;靠 TTL 过期与清理任务回收。
type LoginAttempt struct {
	AttemptKey string    `gorm:"column:attempt_key;primaryKey"` // "email|ip"
	Fails      int       `gorm:"column:fails"`
	FirstAt    time.Time `gorm:"column:first_at"`
	ExpiresAt  time.Time `gorm:"column:expires_at;index"` // first_at + LockFor
}
