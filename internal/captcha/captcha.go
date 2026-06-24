// Package captcha wraps base64Captcha with an in-memory, TTL'd store. It is a
// process-local singleton: codes do not survive a restart nor span instances.
package captcha

import (
	"time"

	"github.com/mojocn/base64Captcha"
)

// Manager generates and verifies digit captchas, holding its own memory store.
type Manager struct {
	cap   *base64Captcha.Captcha
	store base64Captcha.Store
}

// New builds a Manager with a 5-digit driver and a 3-minute memory store.
func New() *Manager {
	store := base64Captcha.NewMemoryStore(10000, 3*time.Minute)
	driver := base64Captcha.NewDriverDigit(80, 240, 5, 0.7, 80)
	cap := base64Captcha.NewCaptcha(driver, store)

	return &Manager{cap: cap, store: store}
}

// Generate returns a captcha id and a base64-encoded PNG data URL. The answer is
// kept server-side in the store.
func (m *Manager) Generate() (id, b64 string, err error) {
	id, b64, _, err = m.cap.Generate()
	return id, b64, err
}

// Verify checks an answer for the given id, clearing it on success or failure
// (one-shot).
func (m *Manager) Verify(id, answer string) bool {
	if id == "" || answer == "" {
		return false
	}

	return m.store.Verify(id, answer, true)
}
