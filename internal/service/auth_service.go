package service

import (
	"context"
	"errors"
	"net"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"gorm.io/gorm"

	zerxv1 "github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1"
	"github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1/zerxv1connect"
	"github.com/zerx-lab/zerxlabkit/internal/auth"
	"github.com/zerx-lab/zerxlabkit/internal/captcha"
	"github.com/zerx-lab/zerxlabkit/internal/config"
	"github.com/zerx-lab/zerxlabkit/internal/model"
	"github.com/zerx-lab/zerxlabkit/internal/ratelimit"
)

// AuthService implements zerxv1connect.AuthServiceHandler.
type AuthService struct {
	db      *gorm.DB
	issuer  *auth.Issuer
	guard   *ratelimit.LoginGuard
	captcha *captcha.Manager
	cfg     config.AuthConfig
}

var _ zerxv1connect.AuthServiceHandler = (*AuthService)(nil)

// NewAuthService constructs the auth handler.
func NewAuthService(db *gorm.DB, issuer *auth.Issuer, guard *ratelimit.LoginGuard, cap *captcha.Manager, cfg config.AuthConfig) *AuthService {
	return &AuthService{db: db, issuer: issuer, guard: guard, captcha: cap, cfg: cfg}
}

// clientIP returns the request peer's host portion (port stripped).
func clientIP(req connect.AnyRequest) string {
	addr := req.Peer().Addr
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}

	return addr
}

func userAgent(req connect.AnyRequest) string {
	return req.Header().Get("User-Agent")
}

// GetCaptcha issues a fresh captcha challenge (public).
func (s *AuthService) GetCaptcha(_ context.Context, _ *connect.Request[zerxv1.GetCaptchaRequest]) (*connect.Response[zerxv1.GetCaptchaResponse], error) {
	id, b64, err := s.captcha.Generate()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.GetCaptchaResponse{CaptchaId: id, ImageBase64: b64}), nil
}

// Login verifies credentials, enforces brute-force protection, records a login
// log, creates a session, and issues an access + refresh token pair.
func (s *AuthService) Login(ctx context.Context, req *connect.Request[zerxv1.LoginRequest]) (*connect.Response[zerxv1.LoginResponse], error) {
	ip := clientIP(req)
	ua := userAgent(req)
	email := req.Msg.GetEmail()
	key := email + "|" + ip

	if locked, _ := s.guard.Locked(key); locked {
		return nil, connect.NewError(connect.CodeResourceExhausted, errors.New("账号暂时锁定，请稍后再试"))
	}

	if s.guard.NeedCaptcha(key) {
		if !s.captcha.Verify(req.Msg.GetCaptchaId(), req.Msg.GetCaptchaCode()) {
			return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("需要验证码或验证码错误"))
		}
	}

	fail := func(uid uint64, e error) error {
		s.guard.Fail(key)
		s.writeLoginLog(model.LoginLog{UserID: uid, Email: email, IP: ip, UserAgent: ua, Success: false, Error: e.Error()})
		return e
	}

	u, err := gorm.G[model.User](s.db).Where("email = ?", email).First(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fail(0, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid credentials")))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if err := auth.Verify(u.PasswordHash, req.Msg.GetPassword()); err != nil {
		return nil, fail(u.ID, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid credentials")))
	}
	if !u.Status {
		return nil, fail(u.ID, connect.NewError(connect.CodePermissionDenied, errors.New("账号已禁用")))
	}
	sid, access, refresh, err := s.startSessionTx(ctx, u, ip, ua)
	if err != nil {
		return nil, err
	}

	s.guard.Reset(key)
	s.writeLoginLog(model.LoginLog{UserID: u.ID, Email: email, IP: ip, UserAgent: ua, Success: true})

	return connect.NewResponse(&zerxv1.LoginResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toProtoUser(u),
		SessionId:    sid,
	}), nil
}

// startSessionTx persists a UserSession (enforcing single-session if configured)
// and mints the access + refresh token pair.
func (s *AuthService) startSessionTx(ctx context.Context, u model.User, ip, ua string) (sid, access, refresh string, err error) {
	sid = uuid.NewString()
	now := time.Now()
	session := model.UserSession{
		ID:         sid,
		UserID:     u.ID,
		IP:         ip,
		UserAgent:  ua,
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  now.Add(s.issuer.RefreshTTL()),
	}

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&session).Error; err != nil {
			return err
		}
		if s.cfg.SingleSession {
			if err := tx.Where("user_id = ? AND id <> ?", u.ID, sid).Delete(&model.UserSession{}).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if txErr != nil {
		return "", "", "", connect.NewError(connect.CodeInternal, txErr)
	}

	access, err = s.issuer.IssueAccess(u.ID, u.Role)
	if err != nil {
		return "", "", "", connect.NewError(connect.CodeInternal, err)
	}
	refresh, err = s.issuer.IssueRefresh(u.ID, sid)
	if err != nil {
		return "", "", "", connect.NewError(connect.CodeInternal, err)
	}

	return sid, access, refresh, nil
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
		Status:       true,
	}
	if err := gorm.G[model.User](s.db).Create(ctx, &u); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	sid, access, refresh, err := s.startSessionTx(ctx, u, clientIP(req), userAgent(req))
	if err != nil {
		return nil, err
	}

	s.writeLoginLog(model.LoginLog{UserID: u.ID, Email: u.Email, Success: true})

	return connect.NewResponse(&zerxv1.RegisterResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toProtoUser(u),
		SessionId:    sid,
	}), nil
}

// Refresh validates the refresh token, checks the session is still live, and
// issues a fresh access token (re-reading the user so role changes propagate).
func (s *AuthService) Refresh(ctx context.Context, req *connect.Request[zerxv1.RefreshRequest]) (*connect.Response[zerxv1.RefreshResponse], error) {
	claims, err := s.issuer.ParseRefresh(req.Msg.GetRefreshToken())
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid refresh token"))
	}

	session, err := gorm.G[model.UserSession](s.db).Where("id = ?", claims.ID).First(ctx)
	if err != nil || session.ExpiresAt.Before(time.Now()) {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("会话已失效"))
	}

	if _, err := gorm.G[model.UserSession](s.db).Where("id = ?", claims.ID).Update(ctx, "last_seen_at", time.Now()); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
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

// Logout revokes every session of the current user.
func (s *AuthService) Logout(ctx context.Context, _ *connect.Request[zerxv1.LogoutRequest]) (*connect.Response[zerxv1.LogoutResponse], error) {
	claims, ok := auth.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	if err := s.db.WithContext(ctx).Where("user_id = ?", claims.UserID).Delete(&model.UserSession{}).Error; err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.LogoutResponse{}), nil
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

// ListSessions returns the caller's sessions; admins may target another user.
func (s *AuthService) ListSessions(ctx context.Context, req *connect.Request[zerxv1.ListSessionsRequest]) (*connect.Response[zerxv1.ListSessionsResponse], error) {
	claims, ok := auth.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	target := req.Msg.GetUserId()
	if target == 0 {
		target = claims.UserID
	} else if target != claims.UserID && claims.Role != model.RoleAdmin {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("forbidden"))
	}

	sessions, err := gorm.G[model.UserSession](s.db).Where("user_id = ?", target).Order("last_seen_at DESC").Find(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	out := make([]*zerxv1.Session, 0, len(sessions))
	for i := range sessions {
		out = append(out, toProtoSession(sessions[i]))
	}

	return connect.NewResponse(&zerxv1.ListSessionsResponse{Sessions: out}), nil
}

// RevokeSession deletes a session owned by the caller, or any session for admins.
func (s *AuthService) RevokeSession(ctx context.Context, req *connect.Request[zerxv1.RevokeSessionRequest]) (*connect.Response[zerxv1.RevokeSessionResponse], error) {
	claims, ok := auth.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	session, err := gorm.G[model.UserSession](s.db).Where("id = ?", req.Msg.GetId()).First(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("session not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if session.UserID != claims.UserID && claims.Role != model.RoleAdmin {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("forbidden"))
	}

	if _, err := gorm.G[model.UserSession](s.db).Where("id = ?", req.Msg.GetId()).Delete(ctx); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.RevokeSessionResponse{}), nil
}

func (s *AuthService) writeLoginLog(rec model.LoginLog) {
	rec.CreatedAt = time.Now()
	db := s.db
	go func() {
		_ = gorm.G[model.LoginLog](db).Create(context.Background(), &rec)
	}()
}
