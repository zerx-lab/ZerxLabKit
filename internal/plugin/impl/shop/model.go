package shop

import (
	"time"

	"gorm.io/gorm"
)

// Product is the shop plugin's product row. TableName is namespaced plg_shop_*
// so ValidateAll and the no-core-table-pollution invariant hold.
type Product struct {
	ID          uint64 `gorm:"primaryKey"`
	Name        string `gorm:"not null"`
	Price       int64  `gorm:"not null;default:0"` // cents
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

// TableName pins the namespaced table name.
func (Product) TableName() string { return "plg_shop_products" }

// Category is the shop plugin's product category (second grouped sub-page).
type Category struct {
	ID        uint64 `gorm:"primaryKey"`
	Name      string `gorm:"not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName pins the namespaced table name.
func (Category) TableName() string { return "plg_shop_categories" }
