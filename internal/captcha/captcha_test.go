package captcha

import "testing"

func TestCaptchaGenerateAndVerify(t *testing.T) {
	m := New()

	id, b64, err := m.Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if id == "" || b64 == "" {
		t.Fatal("Generate returned empty id or image")
	}

	// A wrong answer fails.
	if m.Verify(id, "definitely-wrong-00000") {
		t.Fatal("Verify must reject a wrong answer")
	}

	// The memory store clears on a failed verify (clear=true), so a second
	// attempt with the (still unknown) answer also fails. Confirm one-shot
	// behaviour with a fresh code: generate, but we cannot read the answer, so
	// just assert empty inputs are rejected.
	if m.Verify("", "") {
		t.Fatal("Verify must reject empty id/answer")
	}
	if m.Verify(id, "") {
		t.Fatal("Verify must reject empty answer")
	}
}
