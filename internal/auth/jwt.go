package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/zerx-lab/zerxlabkit/internal/config"
)

// Token types embedded in the JWT to prevent refresh tokens being used as
// access tokens and vice versa.
const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

// ErrInvalidToken is returned for structurally or semantically invalid tokens.
var ErrInvalidToken = errors.New("invalid token")

// Claims is the JWT payload.
type Claims struct {
	jwt.RegisteredClaims
	UserID    uint64 `json:"uid"`
	Role      string `json:"role,omitempty"`
	TokenType string `json:"typ"`
}

// Issuer signs and verifies HS256 JWTs.
type Issuer struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewIssuer builds an Issuer from JWT configuration.
func NewIssuer(cfg config.JWTConfig) *Issuer {
	return &Issuer{
		secret:     []byte(cfg.Secret),
		accessTTL:  cfg.AccessTTL,
		refreshTTL: cfg.RefreshTTL,
	}
}

// IssueAccess mints a short-lived access token carrying the user's role.
func (i *Issuer) IssueAccess(userID uint64, role string) (string, error) {
	return i.issue(userID, role, TokenTypeAccess, i.accessTTL)
}

// IssueRefresh mints a long-lived refresh token (no role).
func (i *Issuer) IssueRefresh(userID uint64) (string, error) {
	return i.issue(userID, "", TokenTypeRefresh, i.refreshTTL)
}

func (i *Issuer) issue(userID uint64, role, tokenType string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatUint(userID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
		UserID:    userID,
		Role:      role,
		TokenType: tokenType,
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.secret)
}

// ParseAccess validates an access token and returns its claims.
func (i *Issuer) ParseAccess(token string) (*Claims, error) {
	return i.parse(token, TokenTypeAccess)
}

// ParseRefresh validates a refresh token and returns its claims.
func (i *Issuer) ParseRefresh(token string) (*Claims, error) {
	return i.parse(token, TokenTypeRefresh)
}

func (i *Issuer) parse(tokenStr, expectedType string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w: unexpected signing method %v", ErrInvalidToken, t.Header["alg"])
		}

		return i.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.TokenType != expectedType {
		return nil, fmt.Errorf("%w: expected %s token", ErrInvalidToken, expectedType)
	}

	return claims, nil
}
