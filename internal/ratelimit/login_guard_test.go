package ratelimit

import (
	"testing"
	"time"
)

func TestLoginGuardThresholds(t *testing.T) {
	g := New(2, 4, time.Hour)
	const key = "a@b.com|1.2.3.4"

	if g.NeedCaptcha(key) {
		t.Fatal("fresh key should not need captcha")
	}

	g.Fail(key)
	if g.NeedCaptcha(key) {
		t.Fatal("1 fail < captchaThreshold; should not need captcha")
	}
	g.Fail(key)
	if !g.NeedCaptcha(key) {
		t.Fatal("2 fails >= captchaThreshold; should need captcha")
	}
	if locked, _ := g.Locked(key); locked {
		t.Fatal("2 fails < lockThreshold; should not be locked")
	}

	g.Fail(key)
	g.Fail(key)
	if locked, _ := g.Locked(key); !locked {
		t.Fatal("4 fails >= lockThreshold; should be locked")
	}

	g.Reset(key)
	if g.NeedCaptcha(key) {
		t.Fatal("after reset, should not need captcha")
	}
	if locked, _ := g.Locked(key); locked {
		t.Fatal("after reset, should not be locked")
	}
}

func TestLoginGuardWindowReset(t *testing.T) {
	g := New(2, 4, time.Millisecond)
	const key = "x"

	g.Fail(key)
	g.Fail(key)
	if !g.NeedCaptcha(key) {
		t.Fatal("should need captcha before window elapses")
	}

	time.Sleep(2 * time.Millisecond)
	// A new fail after the window resets the counter.
	g.Fail(key)
	if g.NeedCaptcha(key) {
		t.Fatal("window elapsed; counter should have reset to 1 fail")
	}
}
