// Package model holds GORM data models and the query-codegen input interfaces.
package model

import (
	"time"

	"gorm.io/gorm"
)

// Role constants for the minimal RBAC scheme.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// User is an account. PasswordHash is never exposed over the API.
type User struct {
	ID           uint64 `gorm:"primaryKey"`
	Email        string `gorm:"uniqueIndex;not null"`
	Name         string
	Nickname     string
	Avatar       string
	Phone        string
	PasswordHash string `gorm:"not null"`
	Role         string `gorm:"not null;default:user"`
	Status       bool   `gorm:"not null;default:true"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    gorm.DeletedAt `gorm:"index"`
}
