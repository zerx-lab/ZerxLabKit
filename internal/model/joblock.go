package model

import "time"

// JobLock 是 gocron 分布式锁的可移植租约行(每任务名一行)。认领靠条件 UPDATE 的
// RowsAffected 判定,仅靠 TTL 过期释放(绝不 DELETE),从而容忍实例间时钟偏移、不双跑。
type JobLock struct {
	LockKey    string    `gorm:"column:lock_key;primaryKey"`
	Owner      string    `gorm:"column:owner"`
	AcquiredAt time.Time `gorm:"column:acquired_at"`
	ExpiresAt  time.Time `gorm:"column:expires_at;index"`
}
