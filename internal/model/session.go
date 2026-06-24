package model

import "time"

// UserSession is an active login session (hard-deleted on revoke/logout). The
// session ID is a UUID stored in the refresh token's jti claim.
type UserSession struct {
	ID         string `gorm:"primaryKey"`
	UserID     uint64 `gorm:"index;not null"`
	IP         string
	UserAgent  string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
}
