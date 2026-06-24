package apispec

import "testing"

func TestProceduresIncludesUserService(t *testing.T) {
	procs := Procedures()
	if len(procs) == 0 {
		t.Fatal("Procedures returned empty; descriptors not registered")
	}

	want := "/zerx.v1.UserService/CreateUser"
	found := false
	for _, p := range procs {
		if p.Procedure == want {
			found = true
			if p.Method != "CreateUser" {
				t.Errorf("Method = %q, want CreateUser", p.Method)
			}
			if p.Service != "zerx.v1.UserService" {
				t.Errorf("Service = %q, want zerx.v1.UserService", p.Service)
			}
		}
	}
	if !found {
		t.Fatalf("Procedures missing %q", want)
	}
}
