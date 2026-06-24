// Package server wires the connectRPC handlers, interceptor chain, embedded SPA,
// upload endpoint, and health check into a single HTTP handler.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1/zerxv1connect"
	"github.com/zerx-lab/zerxlabkit/internal/apispec"
	"github.com/zerx-lab/zerxlabkit/internal/auth"
	"github.com/zerx-lab/zerxlabkit/internal/captcha"
	"github.com/zerx-lab/zerxlabkit/internal/casbin"
	"github.com/zerx-lab/zerxlabkit/internal/config"
	"github.com/zerx-lab/zerxlabkit/internal/jobs"
	"github.com/zerx-lab/zerxlabkit/internal/mailer"
	"github.com/zerx-lab/zerxlabkit/internal/param"
	"github.com/zerx-lab/zerxlabkit/internal/ratelimit"
	"github.com/zerx-lab/zerxlabkit/internal/service"
	"github.com/zerx-lab/zerxlabkit/internal/storage"
	"github.com/zerx-lab/zerxlabkit/internal/web"
)

// New builds the root HTTP handler: connectRPC services under /api, a multipart
// upload endpoint at /api/upload, the embedded SPA at /, and /healthz.
func New(cfg *config.Config, db *gorm.DB, logger *slog.Logger, scheduler *jobs.Scheduler) (http.Handler, error) {
	issuer := auth.NewIssuer(cfg.JWT)

	enforcer, err := casbin.New(db)
	if err != nil {
		return nil, err
	}

	guard := ratelimit.New(cfg.Auth.CaptchaThreshold, cfg.Auth.LockThreshold, cfg.Auth.LockFor)
	cap := captcha.New()
	limiter := ratelimit.NewLimiter(cfg.RateLimit.RPS, cfg.RateLimit.Burst, cfg.RateLimit.TTL)
	policy := auth.NewPolicy(cfg.Password)
	mail := mailer.NewMailer(cfg.SMTP, logger)
	registry := jobs.NewRegistry(db)

	store, err := storage.New(cfg.Storage)
	if err != nil {
		return nil, err
	}

	paramCache := param.New(db)
	if err := paramCache.Load(context.Background()); err != nil {
		return nil, err
	}

	// public: callable without authentication.
	public := map[string]bool{
		zerxv1connect.AuthServiceLoginProcedure:      true,
		zerxv1connect.AuthServiceRegisterProcedure:   true,
		zerxv1connect.AuthServiceRefreshProcedure:    true,
		zerxv1connect.AuthServiceGetCaptchaProcedure: true,
		zerxv1connect.AuthServiceRequestPasswordResetProcedure: true,
		zerxv1connect.AuthServiceConfirmPasswordResetProcedure: true,
	}

	// selfServe: any authenticated caller is allowed (no Casbin check).
	selfServe := map[string]bool{
		zerxv1connect.AuthServiceMeProcedure:             true,
		zerxv1connect.AuthServiceLogoutProcedure:         true,
		zerxv1connect.AuthServiceListSessionsProcedure:   true,
		zerxv1connect.AuthServiceRevokeSessionProcedure:  true,
		zerxv1connect.MenuServiceGetUserMenusProcedure:   true,
		zerxv1connect.MenuServiceGetUserButtonsProcedure: true,
		zerxv1connect.DictServiceGetDictByTypeProcedure:  true,
		zerxv1connect.SiteSettingsServiceGetSiteSettingsProcedure: true,
		zerxv1connect.AuthServiceChangePasswordProcedure:          true,
		zerxv1connect.AuthServiceUpdateProfileProcedure:           true,
		zerxv1connect.AuthServiceSetupTotpProcedure:               true,
		zerxv1connect.AuthServiceActivateTotpProcedure:            true,
		zerxv1connect.AuthServiceDisableTotpProcedure:             true,
	}

	// Interceptor chain (outermost first): logging -> auth -> operation log
	// (also recovers panics) -> casbin -> validate. WithRecover is intentionally
	// omitted; the operation-log interceptor records handler panics with stack.
	chain := []connect.Interceptor{
		NewLoggingInterceptor(logger),
	}
	if cfg.RateLimit.Enabled {
		chain = append(chain, NewRateLimitInterceptor(limiter))
	}
	chain = append(chain,
		auth.NewAuthInterceptor(issuer, public),
		NewOperationLogInterceptor(db),
		auth.NewCasbinInterceptor(enforcer, public, selfServe),
		validate.NewInterceptor(),
	)
	opts := connect.WithInterceptors(chain...)

	api := http.NewServeMux()
	var registered []string
	reg := func(path string, h http.Handler) {
		registered = append(registered, path)
		api.Handle(path, h)
	}
	reg(zerxv1connect.NewAuthServiceHandler(service.NewAuthService(db, issuer, guard, cap, cfg.Auth, mail, policy, paramCache), opts))
	reg(zerxv1connect.NewUserServiceHandler(service.NewUserService(db, policy), opts))
	reg(zerxv1connect.NewRoleServiceHandler(service.NewRoleService(db, enforcer), opts))
	reg(zerxv1connect.NewMenuServiceHandler(service.NewMenuService(db), opts))
	reg(zerxv1connect.NewApiServiceHandler(service.NewApiService(db, enforcer), opts))
	reg(zerxv1connect.NewDictServiceHandler(service.NewDictService(db), opts))
	reg(zerxv1connect.NewSysParamServiceHandler(service.NewSysParamService(db, paramCache), opts))
	reg(zerxv1connect.NewFileServiceHandler(service.NewFileService(db, store), opts))
	reg(zerxv1connect.NewLogServiceHandler(service.NewLogService(db), opts))
	reg(zerxv1connect.NewSiteSettingsServiceHandler(service.NewSiteSettingsService(paramCache), opts))
	reg(zerxv1connect.NewDashboardServiceHandler(service.NewDashboardService(db), opts))
	reg(zerxv1connect.NewJobServiceHandler(service.NewJobService(db, scheduler, registry), opts))

	if err := assertServicesRegistered(registered); err != nil {
		return nil, err
	}

	root := http.NewServeMux()
	root.HandleFunc("/api/export/", exportHandler(issuer, enforcer, db))
	root.HandleFunc("/api/import/users/template", importUsersTemplateHandler(issuer, enforcer))
	root.HandleFunc("/api/import/users", importUsersHandler(issuer, enforcer, db, policy))
	root.HandleFunc("/api/upload", uploadHandler(issuer, store, db))
	root.Handle("/api/", http.StripPrefix("/api", api))
	if cfg.Storage.Driver == "local" {
		prefix := cfg.Storage.LocalBaseURL
		root.Handle(prefix+"/", http.StripPrefix(prefix, http.FileServer(http.Dir(cfg.Storage.LocalDir))))
	}
	if cfg.Server.DocsEnabled {
		root.HandleFunc("/api/openapi.yaml", openAPIHandler())
		root.HandleFunc("/api/docs", docsHandler())
	}
	root.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		sqlDB, err := db.DB()
		if err == nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			err = sqlDB.PingContext(ctx)
		}
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("db unavailable"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})
	root.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	root.Handle("/", web.SPAHandler())

	return root, nil
}

// assertServicesRegistered fails if any zerx.v1 service present in the compiled
// protobuf descriptors is not mounted in the API mux — guarding against adding a
// proto service but forgetting its api.Handle registration (which 404s silently).
func assertServicesRegistered(registered []string) error {
	mounted := make(map[string]bool, len(registered))
	for _, p := range registered {
		mounted[strings.Trim(p, "/")] = true // "/zerx.v1.UserService/" -> "zerx.v1.UserService"
	}
	seen := make(map[string]bool)
	var missing []string
	for _, proc := range apispec.Procedures() {
		if seen[proc.Service] {
			continue
		}
		seen[proc.Service] = true
		if !mounted[proc.Service] {
			missing = append(missing, proc.Service)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("server: unregistered connectRPC services: %s", strings.Join(missing, ", "))
	}
	return nil
}
