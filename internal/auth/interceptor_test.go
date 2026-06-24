package auth

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
)

func TestResolveClaims(t *testing.T) {
	issuer := newIssuer("s", time.Minute, time.Hour)
	tok, err := issuer.IssueAccess(5, []string{"user"})
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}

	if got := resolveClaims(issuer, "Bearer "+tok); got == nil || got.UserID != 5 {
		t.Fatalf("resolveClaims valid = %v, want UserID 5", got)
	}
	if got := resolveClaims(issuer, ""); got != nil {
		t.Errorf("resolveClaims empty header = %v, want nil", got)
	}
	if got := resolveClaims(issuer, "Bearer garbage"); got != nil {
		t.Errorf("resolveClaims garbage = %v, want nil", got)
	}
	if got := resolveClaims(issuer, tok); got != nil {
		t.Errorf("resolveClaims missing Bearer prefix = %v, want nil", got)
	}
}

func TestCheckAuthorized(t *testing.T) {
	public := map[string]bool{"/zerx.v1.AuthService/Login": true}

	if err := checkAuthorized(nil, "/zerx.v1.AuthService/Login", public); err != nil {
		t.Errorf("public without claims: %v, want nil", err)
	}

	err := checkAuthorized(nil, "/zerx.v1.UserService/ListUsers", public)
	if err == nil {
		t.Fatal("protected without claims: want error")
	}
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("code = %v, want Unauthenticated", connect.CodeOf(err))
	}

	if err := checkAuthorized(&Claims{UserID: 1}, "/zerx.v1.UserService/ListUsers", public); err != nil {
		t.Errorf("protected with claims: %v, want nil", err)
	}
}

func TestRequireRole(t *testing.T) {
	if err := RequireRole(context.Background(), "admin"); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("no claims: code = %v, want PermissionDenied", connect.CodeOf(err))
	}

	userCtx := WithClaims(context.Background(), &Claims{Roles: []string{"user"}})
	if err := RequireRole(userCtx, "admin"); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("user role: code = %v, want PermissionDenied", connect.CodeOf(err))
	}

	adminCtx := WithClaims(context.Background(), &Claims{Roles: []string{"admin"}})
	if err := RequireRole(adminCtx, "admin"); err != nil {
		t.Errorf("admin role: %v, want nil", err)
	}
}
