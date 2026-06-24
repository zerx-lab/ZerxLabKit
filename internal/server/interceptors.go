package server

import (
	"context"
	"log/slog"
	"time"

	"connectrpc.com/connect"
)

// NewLoggingInterceptor logs every unary RPC with its procedure, duration, and
// (on failure) connect error code.
func NewLoggingInterceptor(logger *slog.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			start := time.Now()
			res, err := next(ctx, req)

			if err != nil {
				logger.LogAttrs(ctx, slog.LevelWarn, "rpc failed",
					slog.String("procedure", req.Spec().Procedure),
					slog.Duration("duration", time.Since(start)),
					slog.String("code", connect.CodeOf(err).String()),
				)
			} else {
				logger.LogAttrs(ctx, slog.LevelInfo, "rpc ok",
					slog.String("procedure", req.Spec().Procedure),
					slog.Duration("duration", time.Since(start)),
				)
			}

			return res, err
		}
	}
}
