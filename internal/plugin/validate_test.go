package plugin

import (
	"context"
	"testing"

	"github.com/go-gormigrate/gormigrate/v2"
)

// fakePlugin is a configurable Plugin for validation tests.
type fakePlugin struct {
	name       string
	services   []string
	migrations []*gormigrate.Migration
	tables     []string
	menus      []MenuNode
	public      []string
	selfServe   []string
	jobs        map[string]JobHandler
	publicPages []PublicPage
}

func (f fakePlugin) Name() string                    { return f.name }
func (f fakePlugin) Services() []string              { return f.services }
func (f fakePlugin) Migrations() []*gormigrate.Migration { return f.migrations }
func (f fakePlugin) TableNames() []string            { return f.tables }
func (f fakePlugin) SeedMenus() []MenuNode           { return f.menus }
func (f fakePlugin) PublicProcedures() []string      { return f.public }
func (f fakePlugin) SelfServeProcedures() []string   { return f.selfServe }
func (f fakePlugin) RegisterHandlers(RegFunc, Deps)  {}
func (f fakePlugin) JobHandlers() map[string]JobHandler { return f.jobs }
func (f fakePlugin) PublicPages() []PublicPage         { return f.publicPages }

func validOf(t *testing.T, p fakePlugin) error {
	t.Helper()
	reset()
	t.Cleanup(reset)
	Register(p)
	return ValidateAll(Reserved{
		MenuNames: map[string]bool{"users": true},
		MenuPaths: map[string]bool{"/users": true},
	})
}

func TestValidateRejectsBadName(t *testing.T) {
	if err := validOf(t, fakePlugin{name: "Bad Name"}); err == nil {
		t.Fatal("expected invalid name error")
	}
}

func TestValidateRejectsMigrationPrefix(t *testing.T) {
	p := fakePlugin{
		name:       "shop",
		migrations: []*gormigrate.Migration{{ID: "0001_bad"}},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected migration prefix error")
	}
}

func TestValidateRejectsTablePrefix(t *testing.T) {
	p := fakePlugin{name: "shop", tables: []string{"products"}}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected table prefix error")
	}
}

func TestValidateRejectsForeignProcedure(t *testing.T) {
	p := fakePlugin{
		name:     "shop",
		services: []string{"zerx.v1.ShopProductService"},
		public:   []string{"/zerx.v1.UserService/DeleteUser"},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected privilege-escalation rejection")
	}
}

func TestValidateAcceptsOwnedProcedure(t *testing.T) {
	p := fakePlugin{
		name:      "shop",
		services:  []string{"zerx.v1.ShopProductService"},
		selfServe: []string{"/zerx.v1.ShopProductService/ListProducts"},
		tables:    []string{"plg_shop_products"},
		menus: []MenuNode{
			{Name: "plg_shop_products", Path: "/p/shop"},
		},
	}
	if err := validOf(t, p); err != nil {
		t.Fatalf("expected valid plugin, got %v", err)
	}
}

func TestValidateRejectsMenuCollision(t *testing.T) {
	p := fakePlugin{
		name:  "shop",
		menus: []MenuNode{{Name: "users", Path: "/p/shop"}},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected menu name prefix/collision error")
	}
}

func TestValidateRejectsCoreServiceClaim(t *testing.T) {
	// A plugin must not claim a core service to launder its procedure public.
	p := fakePlugin{
		name:     "shop",
		services: []string{"zerx.v1.UserService"},
		public:   []string{"/zerx.v1.UserService/DeleteUser"},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected rejection: plugin claimed a core service (privilege escalation)")
	}
}

func TestValidateRejectsNonNamespacedService(t *testing.T) {
	p := fakePlugin{name: "shop", services: []string{"zerx.v1.WidgetService"}}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected rejection: service not prefixed with plugin PascalCase name")
	}
}

func TestValidateRejectsDuplicateServiceAcrossPlugins(t *testing.T) {
	// Two distinct plugins may not own the same service. (The PascalCase-prefix
	// rule already makes a legit overlap impossible; this is defense-in-depth.)
	reset()
	t.Cleanup(reset)
	Register(fakePlugin{name: "shop", services: []string{"zerx.v1.ShopThing"}})
	Register(fakePlugin{name: "shopextra", services: []string{"zerx.v1.ShopThing"}})
	if err := ValidateAll(Reserved{MenuNames: map[string]bool{}, MenuPaths: map[string]bool{}}); err == nil {
		t.Fatal("expected rejection: same service declared by two plugins")
	}
}

func TestValidateRejectsForeignPublicPagePath(t *testing.T) {
	p := fakePlugin{
		name:        "shop",
		publicPages: []PublicPage{{Path: "/pub/other", Component: "shop/Landing"}},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected public page namespace rejection")
	}
}

func TestValidateRejectsPublicPageEmptyComponent(t *testing.T) {
	p := fakePlugin{
		name:        "shop",
		publicPages: []PublicPage{{Path: "/pub/shop", Component: ""}},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected empty-component rejection")
	}
}

func TestValidateAcceptsPublicPage(t *testing.T) {
	p := fakePlugin{
		name:        "shop",
		publicPages: []PublicPage{{Path: "/pub/shop", Component: "shop/Landing"}},
	}
	if err := validOf(t, p); err != nil {
		t.Fatalf("expected valid public page, got %v", err)
	}
}

func TestValidateRejectsJobPrefix(t *testing.T) {
	p := fakePlugin{
		name: "shop",
		jobs: map[string]JobHandler{"cleanup": {Run: func(context.Context) error { return nil }}},
	}
	if err := validOf(t, p); err == nil {
		t.Fatal("expected job prefix error")
	}
}
