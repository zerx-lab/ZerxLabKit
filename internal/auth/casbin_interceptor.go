package auth

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	casbin "github.com/casbin/casbin/v3"

	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// NewCasbinInterceptor authorizes procedures using Casbin (subject = role code,
// object = procedure). Order is fixed to avoid a nil claims dereference:
//
//	public      -> allow (no claims required)
//	selfServe   -> allow for any authenticated caller
//	admin role  -> allow (bypass)
//	otherwise   -> enforce(role, procedure)
//
// The auth interceptor must run before this one so non-public procedures carry
// claims.
func NewCasbinInterceptor(enforcer *casbin.SyncedCachedEnforcer, public, selfServe map[string]bool) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			proc := req.Spec().Procedure
			if public[proc] {
				return next(ctx, req)
			}

			claims, ok := ClaimsFromContext(ctx)
			if !ok || claims == nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
			}

			if selfServe[proc] {
				return next(ctx, req)
			}
			if claims.Role == model.RoleAdmin {
				return next(ctx, req)
			}

			allowed, err := enforcer.Enforce(claims.Role, proc)
			if err != nil {
				return nil, connect.NewError(connect.CodeInternal, err)
			}
			if !allowed {
				return nil, connect.NewError(connect.CodePermissionDenied, errors.New("permission denied"))
			}

			return next(ctx, req)
		}
	}
}
