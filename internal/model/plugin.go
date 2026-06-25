package model

import "time"

// PluginState records the runtime enable/disable state of a compiled-in plugin.
// Absence of a row means enabled (the default): plugins are on unless explicitly
// disabled. This is a core table (not plugin-owned), so it is not plg_-prefixed.
type PluginState struct {
	Name      string `gorm:"primaryKey"`
	Enabled   bool   `gorm:"not null;default:true"`
	UpdatedAt time.Time
}
