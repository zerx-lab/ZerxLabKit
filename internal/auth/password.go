// Package auth provides password hashing, JWT issuing/parsing, request-context
// claims, and the connectRPC authentication interceptor plus RBAC helpers.
package auth

import "golang.org/x/crypto/bcrypt"

// Hash returns a bcrypt hash of the password.
func Hash(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	return string(b), nil
}

// Verify reports whether password matches the bcrypt hash. A nil error means a
// match; bcrypt.ErrMismatchedHashAndPassword indicates a mismatch.
func Verify(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
