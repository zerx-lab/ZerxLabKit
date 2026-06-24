package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// Limiter is a process-local per-key token-bucket rate limiter. State does not
// span instances and resets on restart (single-instance assumption).
type Limiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rps      rate.Limit
	burst    int
	ttl      time.Duration
}

// NewLimiter builds a Limiter and starts a background cleanup goroutine.
func NewLimiter(rps float64, burst int, ttl time.Duration) *Limiter {
	l := &Limiter{
		visitors: make(map[string]*visitor),
		rps:      rate.Limit(rps),
		burst:    burst,
		ttl:      ttl,
	}
	go l.cleanup()

	return l
}

// Allow reports whether a request for key may proceed now.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	v, ok := l.visitors[key]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(l.rps, l.burst)}
		l.visitors[key] = v
	}
	v.lastSeen = time.Now()

	return v.limiter.Allow()
}

func (l *Limiter) cleanup() {
	ticker := time.NewTicker(l.ttl)
	defer ticker.Stop()
	for range ticker.C {
		l.mu.Lock()
		for k, v := range l.visitors {
			if time.Since(v.lastSeen) > l.ttl {
				delete(l.visitors, k)
			}
		}
		l.mu.Unlock()
	}
}
