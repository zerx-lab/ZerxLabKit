package auth

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"
)

// resolveClaims parses a Bearer access token from an Authorization header value,
// returning the claims on success or nil when absent/invalid.
func resolveClaims(issuer *Issuer, authHeader string) *Claims {
	raw, ok := strings.CutPrefix(authHeader, "Bearer ")
	if !ok {
		return nil
	}

	claims, err := issuer.ParseAccess(raw)
	if err != nil {
		return nil
	}

	return claims
}

// checkAuthorized enforces that non-public procedures carry valid claims.
func checkAuthorized(claims *Claims, procedure string, public map[string]bool) error {
	if claims == nil && !public[procedure] {
		return connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	return nil
}

// NewAuthInterceptor parses a Bearer access token from the Authorization header
// and injects the resulting claims into the context. Procedures whose names are
// keys in `public` are allowed through unauthenticated; all others require a
// valid access token.
func NewAuthInterceptor(issuer *Issuer, public map[string]bool) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			claims := resolveClaims(issuer, req.Header().Get("Authorization"))
			if err := checkAuthorized(claims, req.Spec().Procedure, public); err != nil {
				return nil, err
			}
			if claims != nil {
				ctx = WithClaims(ctx, claims)
			}

			return next(ctx, req)
		}
	}
}
