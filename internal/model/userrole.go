package model

// UserRole associates a user with a role (by code). A user may hold multiple
// roles; this table is the sole authority for user->role assignment.
type UserRole struct {
	UserID   uint64 `gorm:"primaryKey"`
	RoleCode string `gorm:"primaryKey"`
}
