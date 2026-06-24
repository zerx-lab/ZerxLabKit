// Package ratelimit provides an in-memory brute-force guard for login attempts.
// State is process-local: it does not span instances and resets on restart.
package ratelimit

import (
	"sync"
	"time"
)

type entry struct {
	fails int
	first time.Time
}

// LoginGuard tracks failed attempts per key (typically "email|ip") within a
// sliding window, requiring a captcha after captchaThreshold failures and
// locking after lockThreshold failures.
type LoginGuard struct {
	mu               sync.Mutex
	attempts         map[string]*entry
	captchaThreshold int
	lockThreshold    int
	lockFor          time.Duration
}

// New constructs a LoginGuard.
func New(captchaThreshold, lockThreshold int, lockFor time.Duration) *LoginGuard {
	return &LoginGuard{
		attempts:         make(map[string]*entry),
		captchaThreshold: captchaThreshold,
		lockThreshold:    lockThreshold,
		lockFor:          lockFor,
	}
}

// current returns the live entry for key, resetting it if the window elapsed.
// Caller must hold the lock.
func (g *LoginGuard) current(key string) *entry {
	e, ok := g.attempts[key]
	if !ok {
		return nil
	}
	if time.Since(e.first) > g.lockFor {
		delete(g.attempts, key)
		return nil
	}

	return e
}

// Fail records a failed attempt for key.
func (g *LoginGuard) Fail(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	e := g.current(key)
	if e == nil {
		g.attempts[key] = &entry{fails: 1, first: time.Now()}
		return
	}
	e.fails++
}

// NeedCaptcha reports whether a captcha is required for key.
func (g *LoginGuard) NeedCaptcha(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	e := g.current(key)
	return e != nil && e.fails >= g.captchaThreshold
}

// Locked reports whether key is locked and, if so, the remaining lock duration.
func (g *LoginGuard) Locked(key string) (bool, time.Duration) {
	g.mu.Lock()
	defer g.mu.Unlock()

	e := g.current(key)
	if e == nil || e.fails < g.lockThreshold {
		return false, 0
	}

	return true, g.lockFor - time.Since(e.first)
}

// Reset clears all recorded attempts for key (called on successful login).
func (g *LoginGuard) Reset(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	delete(g.attempts, key)
}
