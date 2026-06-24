// Package audit carries handler-supplied change details from service handlers to
// the operation-log interceptor via the request context. Kept in its own package
// so both the server (interceptor) and service (handlers) can use it without an
// import cycle.
package audit

import "context"

// Holder carries the audit detail for one request. Written synchronously within
// the request goroutine (before the async DB write), so no locking is needed.
type Holder struct {
	Detail string
}

type holderKey struct{}

// WithHolder returns a context carrying a fresh audit Holder.
func WithHolder(ctx context.Context) (context.Context, *Holder) {
	h := &Holder{}
	return context.WithValue(ctx, holderKey{}, h), h
}

// Record attaches a change-detail JSON string to the current request's audit
// holder. No-op outside an operation-logged request.
func Record(ctx context.Context, detail string) {
	if h, ok := ctx.Value(holderKey{}).(*Holder); ok && h != nil {
		h.Detail = detail
	}
}
