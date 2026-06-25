package plugin

import "github.com/go-gormigrate/gormigrate/v2"

// registered holds every plugin added via Register. Mutated only at startup
// (single-goroutine) before any DB work, so no synchronization is needed.
var registered []Plugin

// Register adds a plugin to the global registry. Called from
// internal/plugins/all.go (explicit, not via init() side effects).
func Register(p Plugin) {
	registered = append(registered, p)
}

// All returns a snapshot copy of the registered plugins.
func All() []Plugin {
	out := make([]Plugin, len(registered))
	copy(out, registered)
	return out
}

// reset clears the registry. Test-only helper.
func reset() {
	registered = nil
}

// CollectMigrations flattens every plugin's migrations in registration order.
// Plugin migrations run after the core 0001-0005 migrations; gormigrate v2
// rejects duplicate IDs, so prefixed IDs guarantee uniqueness.
func CollectMigrations() []*gormigrate.Migration {
	var out []*gormigrate.Migration
	for _, p := range registered {
		out = append(out, p.Migrations()...)
	}
	return out
}
