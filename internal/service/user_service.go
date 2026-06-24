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
	"github.com/zerx-lab/zerxlabkit/internal/query"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// UserService implements zerxv1connect.UserServiceHandler. All write operations
// require the admin role.
type UserService struct {
	db *gorm.DB
}

var _ zerxv1connect.UserServiceHandler = (*UserService)(nil)

// NewUserService constructs the user handler.
func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

// ListUsers returns a page of users, or name-matched users when a keyword is
// supplied (demonstrating the GORM-CLI generated query).
func (s *UserService) ListUsers(ctx context.Context, req *connect.Request[zerxv1.ListUsersRequest]) (*connect.Response[zerxv1.ListUsersResponse], error) {
	if keyword := req.Msg.GetKeyword(); keyword != "" {
		users, err := query.Query[model.User](s.db).SearchByName(ctx, "%"+keyword+"%")
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		return connect.NewResponse(&zerxv1.ListUsersResponse{
			Users: toProtoUsers(users),
			Total: int64(len(users)),
		}), nil
	}

	page := int(req.Msg.GetPage().GetPage())
	if page < 1 {
		page = 1
	}
	pageSize := int(req.Msg.GetPage().GetPageSize())
	if pageSize < 1 || pageSize > maxPageSize {
		pageSize = defaultPageSize
	}

	total, err := gorm.G[model.User](s.db).Count(ctx, "id")
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	users, err := gorm.G[model.User](s.db).
		Order("id ASC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.ListUsersResponse{
		Users: toProtoUsers(users),
		Total: total,
	}), nil
}

// GetUser returns a single user by id.
func (s *UserService) GetUser(ctx context.Context, req *connect.Request[zerxv1.GetUserRequest]) (*connect.Response[zerxv1.User], error) {
	u, err := gorm.G[model.User](s.db).Where("id = ?", req.Msg.GetId()).First(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("user not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(toProtoUser(u)), nil
}

// CreateUser creates a user. Admin only.
func (s *UserService) CreateUser(ctx context.Context, req *connect.Request[zerxv1.CreateUserRequest]) (*connect.Response[zerxv1.User], error) {
	if err := auth.RequireRole(ctx, model.RoleAdmin); err != nil {
		return nil, err
	}

	_, err := gorm.G[model.User](s.db).Where("email = ?", req.Msg.GetEmail()).First(ctx)
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

	u := model.User{
		Email:        req.Msg.GetEmail(),
		Name:         req.Msg.GetName(),
		PasswordHash: hash,
		Role:         req.Msg.GetRole(),
	}
	if err := gorm.G[model.User](s.db).Create(ctx, &u); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(toProtoUser(u)), nil
}

// UpdateUser updates a user's name and role. Admin only.
func (s *UserService) UpdateUser(ctx context.Context, req *connect.Request[zerxv1.UpdateUserRequest]) (*connect.Response[zerxv1.User], error) {
	if err := auth.RequireRole(ctx, model.RoleAdmin); err != nil {
		return nil, err
	}

	id := req.Msg.GetId()
	if _, err := gorm.G[model.User](s.db).Where("id = ?", id).First(ctx); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("user not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Updates skips zero-value fields: an empty name leaves the name unchanged.
	if _, err := gorm.G[model.User](s.db).Where("id = ?", id).Updates(ctx, model.User{
		Name: req.Msg.GetName(),
		Role: req.Msg.GetRole(),
	}); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	u, err := gorm.G[model.User](s.db).Where("id = ?", id).First(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(toProtoUser(u)), nil
}

// DeleteUser soft-deletes a user. Admin only.
func (s *UserService) DeleteUser(ctx context.Context, req *connect.Request[zerxv1.DeleteUserRequest]) (*connect.Response[zerxv1.DeleteUserResponse], error) {
	if err := auth.RequireRole(ctx, model.RoleAdmin); err != nil {
		return nil, err
	}

	rows, err := gorm.G[model.User](s.db).Where("id = ?", req.Msg.GetId()).Delete(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if rows == 0 {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("user not found"))
	}

	return connect.NewResponse(&zerxv1.DeleteUserResponse{}), nil
}

func toProtoUsers(users []model.User) []*zerxv1.User {
	out := make([]*zerxv1.User, 0, len(users))
	for i := range users {
		out = append(out, toProtoUser(users[i]))
	}

	return out
}
