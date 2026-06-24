// Package casbin wraps a synced, cached Casbin enforcer backed by the shared
// GORM database. The policy model is flat: subject = role code, object =
// connectRPC procedure (no role inheritance, exact-match objects).
package casbin

import (
	"fmt"
	"time"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"gorm.io/gorm"
)

const modelText = `
[request_definition]
r = sub, obj
[policy_definition]
p = sub, obj
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = r.sub == p.sub && r.obj == p.obj
`

// New builds an enforcer using the given DB. The adapter auto-migrates its
// casbin_rule table.
func New(db *gorm.DB) (*casbin.SyncedCachedEnforcer, error) {
	a, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		return nil, fmt.Errorf("casbin adapter: %w", err)
	}

	m, err := model.NewModelFromString(modelText)
	if err != nil {
		return nil, fmt.Errorf("casbin model: %w", err)
	}

	e, err := casbin.NewSyncedCachedEnforcer(m, a)
	if err != nil {
		return nil, fmt.Errorf("casbin enforcer: %w", err)
	}
	e.SetExpireTime(time.Hour)
	if err := e.LoadPolicy(); err != nil {
		return nil, fmt.Errorf("casbin load policy: %w", err)
	}

	return e, nil
}

// SetRoleProcedures replaces all policies for a role with the given procedures.
func SetRoleProcedures(e *casbin.SyncedCachedEnforcer, role string, procs []string) error {
	if _, err := e.RemoveFilteredPolicy(0, role); err != nil {
		return fmt.Errorf("clear role policies: %w", err)
	}
	if len(procs) > 0 {
		rules := make([][]string, 0, len(procs))
		for _, p := range procs {
			rules = append(rules, []string{role, p})
		}
		if _, err := e.AddPolicies(rules); err != nil {
			return fmt.Errorf("add role policies: %w", err)
		}
	}

	return e.InvalidateCache()
}

// GetRoleProcedures returns the procedures granted to a role.
func GetRoleProcedures(e *casbin.SyncedCachedEnforcer, role string) ([]string, error) {
	policies, err := e.GetFilteredPolicy(0, role)
	if err != nil {
		return nil, fmt.Errorf("get role policies: %w", err)
	}

	procs := make([]string, 0, len(policies))
	for _, p := range policies {
		if len(p) >= 2 {
			procs = append(procs, p[1])
		}
	}

	return procs, nil
}

// RemoveRole deletes every policy for a role.
func RemoveRole(e *casbin.SyncedCachedEnforcer, role string) error {
	if _, err := e.RemoveFilteredPolicy(0, role); err != nil {
		return fmt.Errorf("remove role: %w", err)
	}

	return e.InvalidateCache()
}

// RemoveProcedure deletes every policy referencing a procedure (orphan cleanup).
func RemoveProcedure(e *casbin.SyncedCachedEnforcer, proc string) error {
	if _, err := e.RemoveFilteredPolicy(1, proc); err != nil {
		return fmt.Errorf("remove procedure: %w", err)
	}

	return e.InvalidateCache()
}
