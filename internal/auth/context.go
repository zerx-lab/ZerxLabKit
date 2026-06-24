package auth

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
)

type claimsKey struct{}

// WithClaims returns a copy of ctx carrying the authenticated claims.
func WithClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, claims)
}

// ClaimsFromContext extracts the authenticated claims, if present.
func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsKey{}).(*Claims)
	return claims, ok
}

// RequireRole returns a PermissionDenied connect error unless the context
// carries claims with the required role.
func RequireRole(ctx context.Context, role string) error {
	claims, ok := ClaimsFromContext(ctx)
	if !ok {
		return connect.NewError(connect.CodePermissionDenied, errors.New("authentication required"))
	}
	if claims.Role != role {
		return connect.NewError(connect.CodePermissionDenied, fmt.Errorf("requires %q role", role))
	}

	return nil
}
