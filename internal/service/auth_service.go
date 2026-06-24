package service

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"gorm.io/gorm"

	zerxv1 "github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1"
	"github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1/zerxv1connect"
	"github.com/zerx-lab/zerxlabkit/internal/auth"
	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// AuthService implements zerxv1connect.AuthServiceHandler.
type AuthService struct {
	db     *gorm.DB
	issuer *auth.Issuer
}

var _ zerxv1connect.AuthServiceHandler = (*AuthService)(nil)

// NewAuthService constructs the auth handler.
func NewAuthService(db *gorm.DB, issuer *auth.Issuer) *AuthService {
	return &AuthService{db: db, issuer: issuer}
}

// Login verifies credentials and issues an access + refresh token pair.
func (s *AuthService) Login(ctx context.Context, req *connect.Request[zerxv1.LoginRequest]) (*connect.Response[zerxv1.LoginResponse], error) {
	u, err := gorm.G[model.User](s.db).Where("email = ?", req.Msg.GetEmail()).First(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid credentials"))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if err := auth.Verify(u.PasswordHash, req.Msg.GetPassword()); err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid credentials"))
	}

	access, err := s.issuer.IssueAccess(u.ID, u.Role)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	refresh, err := s.issuer.IssueRefresh(u.ID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.LoginResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toProtoUser(u),
	}), nil
}

// Register creates an account. The first user to register becomes admin; all
// subsequent self-registrations are regular users.
func (s *AuthService) Register(ctx context.Context, req *connect.Request[zerxv1.RegisterRequest]) (*connect.Response[zerxv1.RegisterResponse], error) {
	count, err := gorm.G[model.User](s.db).Count(ctx, "id")
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	_, err = gorm.G[model.User](s.db).Where("email = ?", req.Msg.GetEmail()).First(ctx)
	switch {
	case err == nil:
		return nil, connect.NewError(connect.CodeAlreadyExists, errors.New("email already in use"))
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	hash, err := auth.Hash(req.Msg.GetPassword())
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	role := model.RoleUser
	if count == 0 {
		role = model.RoleAdmin
	}

	u := model.User{
		Email:        req.Msg.GetEmail(),
		Name:         req.Msg.GetName(),
		PasswordHash: hash,
		Role:         role,
	}
	if err := gorm.G[model.User](s.db).Create(ctx, &u); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	access, err := s.issuer.IssueAccess(u.ID, u.Role)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	refresh, err := s.issuer.IssueRefresh(u.ID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.RegisterResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toProtoUser(u),
	}), nil
}

// Refresh exchanges a valid refresh token for a fresh access token, re-reading
// the user so role changes propagate.
func (s *AuthService) Refresh(ctx context.Context, req *connect.Request[zerxv1.RefreshRequest]) (*connect.Response[zerxv1.RefreshResponse], error) {
	claims, err := s.issuer.ParseRefresh(req.Msg.GetRefreshToken())
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid refresh token"))
	}

	u, err := gorm.G[model.User](s.db).Where("id = ?", claims.UserID).First(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("user not found"))
	}

	access, err := s.issuer.IssueAccess(u.ID, u.Role)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.RefreshResponse{AccessToken: access}), nil
}

// Me returns the currently authenticated user.
func (s *AuthService) Me(ctx context.Context, _ *connect.Request[zerxv1.MeRequest]) (*connect.Response[zerxv1.MeResponse], error) {
	claims, ok := auth.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	u, err := gorm.G[model.User](s.db).Where("id = ?", claims.UserID).First(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("user not found"))
	}

	return connect.NewResponse(&zerxv1.MeResponse{User: toProtoUser(u)}), nil
}
