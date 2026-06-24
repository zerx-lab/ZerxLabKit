package ratelimit

import (
	"testing"
	"time"
)

func TestLimiterAllowWithinBurst(t *testing.T) {
	// rps=1 with burst=5: the first 5 calls must be allowed (token bucket starts full).
	l := NewLimiter(1, 5, time.Minute)
	key := "test-client"

	for i := 0; i < 5; i++ {
		if !l.Allow(key) {
			t.Fatalf("call %d should be allowed within burst, but was rejected", i+1)
		}
	}
}

func TestLimiterBlocksBeyondBurst(t *testing.T) {
	// rps=1 with burst=3: after 3 fast calls the 4th must be rejected.
	l := NewLimiter(1, 3, time.Minute)
	key := "test-client"

	for i := 0; i < 3; i++ {
		l.Allow(key)
	}

	if l.Allow(key) {
		t.Error("4th call should be rejected after burst exhausted, but was allowed")
	}
}

func TestLimiterDifferentKeysAreIndependent(t *testing.T) {
	l := NewLimiter(1, 2, time.Minute)

	// Exhaust key A.
	l.Allow("A")
	l.Allow("A")

	// Key A exhausted; key B still has its own full bucket.
	if !l.Allow("B") {
		t.Error("key B should have its own independent bucket and allow the first request")
	}
	if l.Allow("A") {
		t.Error("key A should be exhausted and reject the next call")
	}
}
