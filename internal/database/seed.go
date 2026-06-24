package database

import (
	"context"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/zerx-lab/zerxlabkit/internal/apispec"
	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// seedMenu is the declarative source of truth for a menu node and its buttons.
type seedMenu struct {
	menu    model.Menu
	buttons []model.MenuButton
	// userVisible: granted to the built-in "user" role's menu set.
	userVisible bool
}

// crudButtons builds the standard create/update/delete button set for a resource.
func crudButtons(resource, label string) []model.MenuButton {
	return []model.MenuButton{
		{Code: resource + ":create", Name: label + "新增"},
		{Code: resource + ":update", Name: label + "编辑"},
		{Code: resource + ":delete", Name: label + "删除"},
	}
}

// seedMenus is the single source of truth for the navigation tree. Titles are
// i18n keys (translated on the client); Icon values are lucide icon names. To
// add a module: add a route file plus one entry here.
//
// Group headings (Path == "") have ParentID 0; their children reference the
// group by ParentID. Because IDs are assigned at insert time, parent links are
// resolved by index via parentRef below.
var seedMenuTree = []seedMenuNode{
	{node: seedMenu{menu: model.Menu{Path: "/dashboard", Name: "dashboard", Title: "nav.dashboard", Icon: "LayoutDashboardIcon", Sort: 1}, userVisible: true}},
	{
		node: seedMenu{menu: model.Menu{Path: "", Name: "system", Title: "nav.system", Icon: "SettingsIcon", Sort: 2}},
		children: []seedMenuNode{
			{node: seedMenu{menu: model.Menu{Path: "/users", Name: "users", Title: "nav.users", Icon: "UsersIcon", Sort: 1}, buttons: append(crudButtons("user", "用户"), model.MenuButton{Code: "user:reset", Name: "用户重置密码"})}},
			{node: seedMenu{menu: model.Menu{Path: "/roles", Name: "roles", Title: "nav.roles", Icon: "ShieldIcon", Sort: 2}, buttons: crudButtons("role", "角色")}},
			{node: seedMenu{menu: model.Menu{Path: "/menus", Name: "menus", Title: "nav.menus", Icon: "ListTreeIcon", Sort: 3}, buttons: crudButtons("menu", "菜单")}},
			{node: seedMenu{menu: model.Menu{Path: "/apis", Name: "apis", Title: "nav.apis", Icon: "PlugIcon", Sort: 4}, buttons: crudButtons("api", "接口")}},
			{node: seedMenu{menu: model.Menu{Path: "/dicts", Name: "dicts", Title: "nav.dicts", Icon: "BookIcon", Sort: 5}, buttons: crudButtons("dict", "字典")}},
			{node: seedMenu{menu: model.Menu{Path: "/params", Name: "params", Title: "nav.params", Icon: "SlidersHorizontalIcon", Sort: 6}, buttons: crudButtons("param", "参数")}},
			{node: seedMenu{menu: model.Menu{Path: "/files", Name: "files", Title: "nav.files", Icon: "FolderIcon", Sort: 7}}},
			{node: seedMenu{menu: model.Menu{Path: "/sessions", Name: "sessions", Title: "nav.sessions", Icon: "MonitorIcon", Sort: 8}}},
		},
	},
	{
		node: seedMenu{menu: model.Menu{Path: "", Name: "audit", Title: "nav.audit", Icon: "ScrollTextIcon", Sort: 3}},
		children: []seedMenuNode{
			{node: seedMenu{menu: model.Menu{Path: "/operation-logs", Name: "operation-logs", Title: "nav.operationLogs", Icon: "ScrollTextIcon", Sort: 1}}},
			{node: seedMenu{menu: model.Menu{Path: "/login-logs", Name: "login-logs", Title: "nav.loginLogs", Icon: "LogInIcon", Sort: 2}}},
			{node: seedMenu{menu: model.Menu{Path: "/error-logs", Name: "error-logs", Title: "nav.errorLogs", Icon: "TriangleAlertIcon", Sort: 3}}},
		},
	},
}

type seedMenuNode struct {
	node     seedMenu
	children []seedMenuNode
}

// Seed populates baseline RBAC data. It is idempotent on the Role table being
// empty, so it runs only on a fresh database. Casbin policies are NOT seeded:
// admin bypasses enforcement and the user role relies only on self-serve
// procedures.
func Seed(db *gorm.DB) error {
	count, err := gorm.G[model.Role](db).Count(context.Background(), "id")
	if err != nil {
		return fmt.Errorf("seed: count roles: %w", err)
	}
	if count > 0 {
		// Roles exist already: only keep the API catalog fresh.
		return syncAPIs(db)
	}

	ctx := context.Background()

	roles := []model.Role{
		{Code: model.RoleAdmin, Name: "超级管理员", Description: "拥有全部权限", Builtin: true, Sort: 1},
		{Code: model.RoleUser, Name: "普通用户", Description: "默认角色", Builtin: true, Sort: 2},
	}
	if err := gorm.G[model.Role](db).CreateInBatches(ctx, &roles, len(roles)); err != nil {
		return fmt.Errorf("seed roles: %w", err)
	}

	var (
		adminMenuIDs   []uint64
		userMenuIDs    []uint64
		adminButtonIDs []uint64
	)

	var insertTree func(nodes []seedMenuNode, parentID uint64) error
	insertTree = func(nodes []seedMenuNode, parentID uint64) error {
		for i := range nodes {
			m := nodes[i].node.menu
			m.ParentID = parentID
			if err := gorm.G[model.Menu](db).Create(ctx, &m); err != nil {
				return fmt.Errorf("seed menu %q: %w", m.Name, err)
			}
			adminMenuIDs = append(adminMenuIDs, m.ID)
			if nodes[i].node.userVisible {
				userMenuIDs = append(userMenuIDs, m.ID)
			}

			for j := range nodes[i].node.buttons {
				b := nodes[i].node.buttons[j]
				b.MenuID = m.ID
				if err := gorm.G[model.MenuButton](db).Create(ctx, &b); err != nil {
					return fmt.Errorf("seed button %q: %w", b.Code, err)
				}
				adminButtonIDs = append(adminButtonIDs, b.ID)
			}

			if err := insertTree(nodes[i].children, m.ID); err != nil {
				return err
			}
		}

		return nil
	}
	if err := insertTree(seedMenuTree, 0); err != nil {
		return err
	}

	// admin: every menu + every button.
	roleMenus := make([]model.RoleMenu, 0, len(adminMenuIDs))
	for _, id := range adminMenuIDs {
		roleMenus = append(roleMenus, model.RoleMenu{RoleCode: model.RoleAdmin, MenuID: id})
	}
	// user: dashboard only.
	for _, id := range userMenuIDs {
		roleMenus = append(roleMenus, model.RoleMenu{RoleCode: model.RoleUser, MenuID: id})
	}
	if len(roleMenus) > 0 {
		if err := gorm.G[model.RoleMenu](db).CreateInBatches(ctx, &roleMenus, len(roleMenus)); err != nil {
			return fmt.Errorf("seed role menus: %w", err)
		}
	}

	roleButtons := make([]model.RoleButton, 0, len(adminButtonIDs))
	for _, id := range adminButtonIDs {
		roleButtons = append(roleButtons, model.RoleButton{RoleCode: model.RoleAdmin, ButtonID: id})
	}
	if len(roleButtons) > 0 {
		if err := gorm.G[model.RoleButton](db).CreateInBatches(ctx, &roleButtons, len(roleButtons)); err != nil {
			return fmt.Errorf("seed role buttons: %w", err)
		}
	}

	return syncAPIs(db)
}

// syncAPIs upserts the full procedure catalog into the apis table.
func syncAPIs(db *gorm.DB) error {
	procs := apispec.Procedures()
	if len(procs) == 0 {
		return nil
	}

	rows := make([]model.API, 0, len(procs))
	for _, p := range procs {
		rows = append(rows, model.API{
			Procedure: p.Procedure,
			Service:   p.Service,
			Method:    p.Method,
			Group:     shortService(p.Service),
		})
	}

	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "procedure"}},
		DoNothing: true,
	}).Create(&rows).Error
}

// shortService returns the trailing segment of a fully-qualified service name
// (zerx.v1.UserService -> UserService).
func shortService(full string) string {
	for i := len(full) - 1; i >= 0; i-- {
		if full[i] == '.' {
			return full[i+1:]
		}
	}

	return full
}
