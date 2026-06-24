// Package server wires the connectRPC handlers, interceptor chain, embedded SPA,
// and health check into a single HTTP handler.
package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1/zerxv1connect"
	"github.com/zerx-lab/zerxlabkit/internal/auth"
	"github.com/zerx-lab/zerxlabkit/internal/config"
	"github.com/zerx-lab/zerxlabkit/internal/service"
	"github.com/zerx-lab/zerxlabkit/internal/web"
)

// New builds the root HTTP handler: connectRPC services mounted under /api, the
// embedded SPA at /, and a /healthz check.
func New(cfg *config.Config, db *gorm.DB, logger *slog.Logger) http.Handler {
	issuer := auth.NewIssuer(cfg.JWT)

	// Login, Register and Refresh may be called without authentication.
	public := map[string]bool{
		zerxv1connect.AuthServiceLoginProcedure:    true,
		zerxv1connect.AuthServiceRegisterProcedure: true,
		zerxv1connect.AuthServiceRefreshProcedure:  true,
	}

	// Interceptor chain (outermost first): logging -> auth -> validate.
	// WithRecover appends the recover interceptor innermost, so handler panics
	// are converted to errors that the logging interceptor still records.
	opts := connect.WithHandlerOptions(
		connect.WithInterceptors(
			NewLoggingInterceptor(logger),
			auth.NewAuthInterceptor(issuer, public),
			validate.NewInterceptor(),
		),
		connect.WithRecover(func(_ context.Context, _ connect.Spec, _ http.Header, p any) error {
			logger.Error("recovered from panic in handler", "panic", p)
			return connect.NewError(connect.CodeInternal, errors.New("internal error"))
		}),
	)

	api := http.NewServeMux()
	api.Handle(zerxv1connect.NewAuthServiceHandler(service.NewAuthService(db, issuer), opts))
	api.Handle(zerxv1connect.NewUserServiceHandler(service.NewUserService(db), opts))

	root := http.NewServeMux()
	root.Handle("/api/", http.StripPrefix("/api", api))
	root.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	root.Handle("/", web.SPAHandler())

	return root
}
