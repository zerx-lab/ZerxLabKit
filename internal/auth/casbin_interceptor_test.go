package auth

import (
	"context"
	"testing"

	casbinlib "github.com/casbin/casbin/v3"
	casbinmodel "github.com/casbin/casbin/v3/model"
	"connectrpc.com/connect"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// newTestEnforcer builds an in-memory Casbin enforcer for tests.
func newTestEnforcer(t *testing.T) *casbinlib.SyncedCachedEnforcer {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared&_test_casbin="+t.Name()), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	adapter, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		t.Fatalf("casbin adapter: %v", err)
	}
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
	m, err := casbinmodel.NewModelFromString(modelText)
	if err != nil {
		t.Fatalf("casbin model: %v", err)
	}
	e, err := casbinlib.NewSyncedCachedEnforcer(m, adapter)
	if err != nil {
		t.Fatalf("casbin enforcer: %v", err)
	}
	if err := e.LoadPolicy(); err != nil {
		t.Fatalf("casbin load: %v", err)
	}
	return e
}

// stubRequest is a minimal connect.AnyRequest for interceptor testing.
type stubRequest struct {
	connect.AnyRequest
	proc string
}

func (s stubRequest) Spec() connect.Spec { return connect.Spec{Procedure: s.proc} }

func TestCasbinInterceptorMultiRole(t *testing.T) {
	const proc = "/zerx.v1.UserService/ListUsers"

	e := newTestEnforcer(t)
	// Grant proc to "editor" only.
	if _, err := e.AddPolicy("editor", proc); err != nil {
		t.Fatalf("AddPolicy: %v", err)
	}

	public := map[string]bool{}
	selfServe := map[string]bool{}
	interceptor := NewCasbinInterceptor(e, public, selfServe)

	noop := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		return connect.NewResponse(&struct{}{}), nil
	})

	t.Run("admin bypasses casbin", func(t *testing.T) {
		ctx := WithClaims(context.Background(), &Claims{UserID: 1, Roles: []string{"admin"}})
		req := stubRequest{proc: proc}
		_, err := interceptor(noop)(ctx, req)
		if err != nil {
			t.Errorf("admin with Roles=[admin]: got error %v, want nil", err)
		}
	})

	t.Run("editor granted proc is allowed", func(t *testing.T) {
		ctx := WithClaims(context.Background(), &Claims{UserID: 2, Roles: []string{"editor"}})
		req := stubRequest{proc: proc}
		_, err := interceptor(noop)(ctx, req)
		if err != nil {
			t.Errorf("editor with granted proc: got error %v, want nil", err)
		}
	})

	t.Run("viewer not granted gets PermissionDenied", func(t *testing.T) {
		ctx := WithClaims(context.Background(), &Claims{UserID: 3, Roles: []string{"viewer"}})
		req := stubRequest{proc: proc}
		_, err := interceptor(noop)(ctx, req)
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("viewer without grant: got code %v, want PermissionDenied", connect.CodeOf(err))
		}
	})

	t.Run("multi-role any-match allows", func(t *testing.T) {
		// viewer+editor: editor has the grant, so allow.
		ctx := WithClaims(context.Background(), &Claims{UserID: 4, Roles: []string{"viewer", "editor"}})
		req := stubRequest{proc: proc}
		_, err := interceptor(noop)(ctx, req)
		if err != nil {
			t.Errorf("viewer+editor: got error %v, want nil", err)
		}
	})
}
