package model

import "time"

// CaptchaCode 是验证码答案的共享存储行,跨实例可验,靠 TTL 过期与清理任务回收。
type CaptchaCode struct {
	ID        string    `gorm:"primaryKey"`
	Answer    string    `gorm:"column:answer"`
	ExpiresAt time.Time `gorm:"column:expires_at;index"`
}
