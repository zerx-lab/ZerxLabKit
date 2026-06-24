// Package service implements the connectRPC handlers, translating between proto
// messages and the data layer. Write operations enforce admin RBAC.
package service

import (
	"time"

	zerxv1 "github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1"
	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// toProtoUser maps a data-layer user to its public proto representation
// (password hash intentionally omitted).
func toProtoUser(u model.User) *zerxv1.User {
	return &zerxv1.User{
		Id:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		Role:      u.Role,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
}
