package auth

import "testing"

func TestHashVerifyRoundTrip(t *testing.T) {
	const pw = "s3cret-password"

	hash, err := Hash(pw)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if hash == pw {
		t.Fatal("hash must not equal plaintext")
	}

	if err := Verify(hash, pw); err != nil {
		t.Fatalf("Verify correct password: %v", err)
	}
	if err := Verify(hash, "wrong-password"); err == nil {
		t.Fatal("Verify must fail for a wrong password")
	}
}
