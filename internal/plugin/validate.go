package plugin

import (
	"fmt"
	"regexp"
	"strings"
)

var nameRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,30}$`)

// Reserved holds the core menu Name/Path sets (and any other reserved
// identifiers) that plugin menus must not collide with. cmd/server/main.go
// builds this from the database package's seed tree and passes it in, keeping
// the plugin package free of a database import.
type Reserved struct {
	MenuNames map[string]bool
	MenuPaths map[string]bool
}

// ValidateAll checks every registered plugin and returns the first violation.
// A non-nil error must abort startup before any DB work (security boundary).
func ValidateAll(reserved Reserved) error {
	seenName := make(map[string]bool)
	// Global service set: a connectRPC service may be owned by exactly one plugin.
	seenService := make(map[string]bool)
	// Accumulate menu Name/Path across plugins so cross-plugin collisions are
	// also caught (seeded with the core reserved sets).
	menuNames := make(map[string]bool, len(reserved.MenuNames))
	for n := range reserved.MenuNames {
		menuNames[n] = true
	}
	menuPaths := make(map[string]bool, len(reserved.MenuPaths))
	for p := range reserved.MenuPaths {
		menuPaths[p] = true
	}

	for _, p := range All() {
		name := p.Name()
		if !nameRe.MatchString(name) {
			return fmt.Errorf("invalid plugin name %q: must match %s", name, nameRe.String())
		}
		if seenName[name] {
			return fmt.Errorf("duplicate plugin name %q", name)
		}
		seenName[name] = true

		migPrefix := "plg_" + name + "_"
		for _, m := range p.Migrations() {
			if !strings.HasPrefix(m.ID, migPrefix) {
				return fmt.Errorf("plugin %q migration ID %q must be prefixed %q", name, m.ID, migPrefix)
			}
		}

		tablePrefix := "plg_" + name + "_"
		for _, tbl := range p.TableNames() {
			if !strings.HasPrefix(tbl, tablePrefix) {
				return fmt.Errorf("plugin %q table %q must be prefixed %q", name, tbl, tablePrefix)
			}
		}

		jobPrefix := name + "_"
		for k := range p.JobHandlers() {
			if !strings.HasPrefix(k, jobPrefix) {
				return fmt.Errorf("plugin %q job handler key %q must be prefixed %q", name, k, jobPrefix)
			}
		}

		// Service ownership (security boundary): a plugin's services must be its own,
		// not a core service and not another plugin's. The short service name must
		// start with the plugin's PascalCase name (convention: shop ->
		// "zerx.v1.ShopProductService"); core services (e.g. UserService) and other
		// plugins' services therefore cannot be claimed. This is what makes the
		// procedure-ownership check below a real anti-privilege-escalation guard:
		// without it a plugin could declare Services()=["zerx.v1.UserService"] and
		// launder a core procedure into the public/self-serve maps. Also enforce a
		// single owner per service across all plugins (else the runtime disable gate
		// would resolve a shared service to only one plugin).
		svcPrefix := pascalCase(name)
		svcSet := make(map[string]bool, len(p.Services()))
		for _, s := range p.Services() {
			short := serviceShortName(s)
			if !strings.HasPrefix(short, svcPrefix) {
				return fmt.Errorf("plugin %q service %q must be named with the plugin's PascalCase prefix %q (e.g. zerx.v1.%sXxxService)", name, s, svcPrefix, svcPrefix)
			}
			if seenService[s] {
				return fmt.Errorf("service %q declared by more than one plugin", s)
			}
			seenService[s] = true
			svcSet[s] = true
		}
		checkProcs := func(kind string, procs []string) error {
			for _, proc := range procs {
				svc, ok := procServiceOf(proc)
				if !ok {
					return fmt.Errorf("plugin %q %s procedure %q is malformed (want /<service>/<method>)", name, kind, proc)
				}
				if !svcSet[svc] {
					return fmt.Errorf("plugin %q %s procedure %q does not belong to a plugin-owned service (potential privilege escalation)", name, kind, proc)
				}
			}
			return nil
		}
		if err := checkProcs("public", p.PublicProcedures()); err != nil {
			return err
		}
		if err := checkProcs("self-serve", p.SelfServeProcedures()); err != nil {
			return err
		}

		// Menu namespacing + collision.
		menuNamePrefix := "plg_" + name
		menuPathPrefix := "/p/" + name
		var walk func(nodes []MenuNode) error
		walk = func(nodes []MenuNode) error {
			for i := range nodes {
				n := nodes[i]
				// Name must be exactly "plg_<name>" or "plg_<name>_...": the trailing
				// delimiter keeps this in lockstep with PluginNameOfMenu (used by the
				// disable gate), so "plg_shop" can't be confused with "plg_shopkeeper"
				// and every plugin menu is correctly attributed when disabled.
				if n.Name != menuNamePrefix && !strings.HasPrefix(n.Name, menuNamePrefix+"_") {
					return fmt.Errorf("plugin %q menu name %q must be %q or a %q-prefixed name", name, n.Name, menuNamePrefix, menuNamePrefix+"_")
				}
				// Group headings have empty Path; leaf routes must be namespaced as
				// exactly "/p/<name>" or a sub-path "/p/<name>/..." (the trailing
				// delimiter prevents "/p/shopping" matching plugin "shop").
				if n.Path != "" && n.Path != menuPathPrefix && !strings.HasPrefix(n.Path, menuPathPrefix+"/") {
					return fmt.Errorf("plugin %q menu path %q must be %q or a %q sub-path", name, n.Path, menuPathPrefix, menuPathPrefix+"/")
				}
				if menuNames[n.Name] {
					return fmt.Errorf("plugin %q menu name %q collides with an existing menu", name, n.Name)
				}
				menuNames[n.Name] = true
				if n.Path != "" {
					if menuPaths[n.Path] {
						return fmt.Errorf("plugin %q menu path %q collides with an existing menu", name, n.Path)
					}
					menuPaths[n.Path] = true
				}
				if err := walk(n.Children); err != nil {
					return err
				}
			}
			return nil
		}
		if err := walk(p.SeedMenus()); err != nil {
			return err
		}

		// Public pages must be namespaced "/pub/<name>" or "/pub/<name>/..." (the
		// trailing delimiter prevents "/pub/shopping" matching plugin "shop").
		pubPrefix := "/pub/" + name
		for _, pg := range p.PublicPages() {
			if pg.Path != pubPrefix && !strings.HasPrefix(pg.Path, pubPrefix+"/") {
				return fmt.Errorf("plugin %q public page path %q must be %q or a %q sub-path", name, pg.Path, pubPrefix, pubPrefix+"/")
			}
			if pg.Component == "" {
				return fmt.Errorf("plugin %q public page %q has empty component", name, pg.Path)
			}
		}
	}
	return nil
}

// pascalCase converts a lower_snake plugin name to PascalCase
// ("shop" -> "Shop", "my_mod" -> "MyMod").
func pascalCase(name string) string {
	var b strings.Builder
	for _, part := range strings.Split(name, "_") {
		if part == "" {
			continue
		}
		b.WriteString(strings.ToUpper(part[:1]))
		b.WriteString(part[1:])
	}
	return b.String()
}

// serviceShortName returns the trailing segment of a fully-qualified service
// name ("zerx.v1.ShopProductService" -> "ShopProductService").
func serviceShortName(full string) string {
	if i := strings.LastIndex(full, "."); i >= 0 {
		return full[i+1:]
	}
	return full
}

// procServiceOf extracts the service name from a connectRPC procedure path
// "/<service>/<method>" -> "<service>".
func procServiceOf(proc string) (string, bool) {
	trimmed := strings.Trim(proc, "/")
	idx := strings.LastIndex(trimmed, "/")
	if idx <= 0 || idx == len(trimmed)-1 {
		return "", false
	}
	return trimmed[:idx], true
}
