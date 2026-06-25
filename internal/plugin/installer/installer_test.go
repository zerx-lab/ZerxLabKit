package installer

import (
	"archive/zip"
	"bytes"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"testing"
)

// makeZip builds an in-memory plugin package zip from name->content entries.
func makeZip(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("zip create: %v", err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("zip write: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return buf.Bytes()
}

// newRepo creates a minimal repo layout with an all.go carrying the anchors.
func newRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	allDir := filepath.Join(root, "internal", "plugins")
	if err := os.MkdirAll(allDir, 0o755); err != nil {
		t.Fatal(err)
	}
	allGo := `package plugins

	import (
	"github.com/acme/foo/internal/plugin"
	"github.com/acme/foo/internal/plugin/impl/shop"
	// plugin-import-anchor
)

var _ = plugin.All

func Register() {
	plugin.Register(shop.New())
	// plugin-register-anchor
}
`
	if err := os.WriteFile(filepath.Join(allDir, "all.go"), []byte(allGo), 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

const module = "github.com/acme/foo"

func TestInstallUninstallRoundTrip(t *testing.T) {
	root := newRepo(t)
	pkg := makeZip(t, map[string]string{
		"plugin.json":      `{"name":"blog"}`,
		"proto/blog.proto": "syntax = \"proto3\";",
		"impl/plugin.go":   "package blog",
		"web/Blog.tsx":     "export default function Blog(){return null}",
		"web/i18n.ts":      "export default { en: { title: \"Blog\" }, zh: { title: \"\u535a\u5ba2\" } }",
	})

	res, err := Install(pkg, root, module)
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if res.Name != "blog" {
		t.Fatalf("name = %q, want blog", res.Name)
	}

	// Files landed in the right places.
	for _, p := range []string{
		filepath.Join(root, "proto", "zerx", "v1", "blog.proto"),
		filepath.Join(root, "internal", "plugin", "impl", "blog", "plugin.go"),
		filepath.Join(root, "web", "src", "plugin-components", "blog", "Blog.tsx"),
		// Self-contained plugin translations land alongside the component, so
		// the glob in i18n.tsx picks them up on rebuild.
		filepath.Join(root, "web", "src", "plugin-components", "blog", "i18n.ts"),
	} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected file %s: %v", p, err)
		}
	}
	// all.go wired.
	all, _ := os.ReadFile(filepath.Join(root, "internal", "plugins", "all.go"))
	if !bytes.Contains(all, []byte(`"github.com/acme/foo/internal/plugin/impl/blog"`)) ||
		!bytes.Contains(all, []byte("plugin.Register(blog.New())")) {
		t.Fatalf("all.go not wired:\n%s", all)
	}

	// Re-install must refuse (already present).
	if _, err := Install(pkg, root, module); err == nil {
		t.Fatal("expected re-install to fail (already present)")
	}

	// Uninstall removes everything and the all.go lines.
	if _, err := Uninstall(root, module, "blog"); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}
	for _, p := range []string{
		filepath.Join(root, "proto", "zerx", "v1", "blog.proto"),
		filepath.Join(root, "internal", "plugin", "impl", "blog"),
		filepath.Join(root, "web", "src", "plugin-components", "blog"),
	} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Fatalf("expected %s removed", p)
		}
	}
	all2, _ := os.ReadFile(filepath.Join(root, "internal", "plugins", "all.go"))
	if bytes.Contains(all2, []byte("blog")) {
		t.Fatalf("all.go still references blog:\n%s", all2)
	}
	// Anchors preserved (shop still there).
	if !bytes.Contains(all2, []byte("plugin-import-anchor")) || !bytes.Contains(all2, []byte("shop.New()")) {
		t.Fatalf("anchors/shop lost:\n%s", all2)
	}
}

// TestUninstallAnchorPlugin verifies the seed plugin (shop) can be uninstalled
// cleanly now that anchors live on dedicated lines (no plugin line carries them).
func TestUninstallAnchorPlugin(t *testing.T) {
	root := newRepo(t)
	// shop's source need not exist for the all.go-line removal check.
	if _, err := Uninstall(root, module, "shop"); err != nil {
		t.Fatalf("Uninstall shop: %v", err)
	}
	all, _ := os.ReadFile(filepath.Join(root, "internal", "plugins", "all.go"))
	if bytes.Contains(all, []byte("impl/shop")) || bytes.Contains(all, []byte("shop.New()")) {
		t.Fatalf("shop lines not removed:\n%s", all)
	}
	// Anchors preserved for future inserts.
	if !bytes.Contains(all, []byte("plugin-import-anchor")) || !bytes.Contains(all, []byte("plugin-register-anchor")) {
		t.Fatalf("anchors lost:\n%s", all)
	}
}

// TestUninstallLastPluginKeepsAllGoValid verifies the invariant that
// uninstalling the last plugin leaves all.go as valid, compilable Go: the
// `var _ = plugin.All` sentinel keeps the plugin import used even with an empty
// Register body, so the build (and server) never breaks.
func TestUninstallLastPluginKeepsAllGoValid(t *testing.T) {
	root := newRepo(t)
	if _, err := Uninstall(root, module, "shop"); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}
	src, err := os.ReadFile(filepath.Join(root, "internal", "plugins", "all.go"))
	if err != nil {
		t.Fatal(err)
	}
	// Must still parse as Go.
	if _, err := parser.ParseFile(token.NewFileSet(), "all.go", src, parser.AllErrors); err != nil {
		t.Fatalf("all.go no longer parses after uninstalling last plugin: %v\n%s", err, src)
	}
	// plugin import must remain referenced (sentinel) and shop fully gone.
	if !bytes.Contains(src, []byte("var _ = plugin.All")) {
		t.Fatalf("sentinel lost \u2014 plugin import would be unused:\n%s", src)
	}
	if bytes.Contains(src, []byte("impl/shop")) || bytes.Contains(src, []byte("shop.New()")) {
		t.Fatalf("shop not removed:\n%s", src)
	}
	// Register body is now empty except the anchor comment \u2014 confirm no dangling ref.
	if !bytes.Contains(src, []byte("plugin-register-anchor")) {
		t.Fatalf("register anchor lost:\n%s", src)
	}
}

// TestUninstallToleratesEmptyResidualDir verifies the Windows-lock workaround:
// if a plugin's impl files are already gone but an empty directory remains
// (a handle held it open during deletion), Uninstall still succeeds and removes
// the all.go lines. onlyEmptyDirs accepts the empty residue as a clean removal.
func TestUninstallToleratesEmptyResidualDir(t *testing.T) {
	root := newRepo(t)
	// Simulate the post-lock state: source files removed, empty dir remains.
	implDir := filepath.Join(root, "internal", "plugin", "impl", "shop")
	if err := os.MkdirAll(implDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := Uninstall(root, module, "shop"); err != nil {
		t.Fatalf("Uninstall with empty residual dir: %v", err)
	}
	all, _ := os.ReadFile(filepath.Join(root, "internal", "plugins", "all.go"))
	if bytes.Contains(all, []byte("impl/shop")) || bytes.Contains(all, []byte("shop.New()")) {
		t.Fatalf("shop lines not removed:\n%s", all)
	}
}

// TestOnlyEmptyDirs covers the residue classifier directly.
func TestOnlyEmptyDirs(t *testing.T) {
	root := t.TempDir()
	if got := onlyEmptyDirs(filepath.Join(root, "absent")); !got {
		t.Fatal("absent path should be treated as empty")
	}
	nested := filepath.Join(root, "a", "b")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := onlyEmptyDirs(filepath.Join(root, "a")); !got {
		t.Fatal("tree of empty dirs should be empty")
	}
	if err := os.WriteFile(filepath.Join(nested, "x.go"), []byte("package x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := onlyEmptyDirs(filepath.Join(root, "a")); got {
		t.Fatal("tree with a file is not empty")
	}
}

func TestInstallRejectsZipSlip(t *testing.T) {
	root := newRepo(t)
	pkg := makeZip(t, map[string]string{
		"plugin.json":       `{"name":"evil"}`,
		"../../../etc/x.go": "package x",
	})
	// The traversal entry is skipped (unsafe path -> cleanArcPath ""), leaving no
	// installable files -> install fails rather than escaping the repo.
	if _, err := Install(pkg, root, module); err == nil {
		t.Fatal("expected install to fail on zip-slip-only package")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(root), "etc", "x.go")); err == nil {
		t.Fatal("zip-slip escaped the repo root")
	}
}

func TestInstallRejectsBadName(t *testing.T) {
	root := newRepo(t)
	pkg := makeZip(t, map[string]string{
		"plugin.json":    `{"name":"Bad Name"}`,
		"impl/plugin.go": "package x",
	})
	if _, err := Install(pkg, root, module); err == nil {
		t.Fatal("expected install to reject invalid plugin name")
	}
}

func TestInstallRejectsGoKeywordName(t *testing.T) {
	root := newRepo(t)
	pkg := makeZip(t, map[string]string{
		"plugin.json":    `{"name":"map"}`,
		"impl/plugin.go": "package x",
	})
	if _, err := Install(pkg, root, module); err == nil {
		t.Fatal("expected install to reject a Go keyword name")
	}
}

func TestInstallRejectsTooManyFiles(t *testing.T) {
	root := newRepo(t)
	entries := map[string]string{"plugin.json": `{"name":"big"}`}
	for i := 0; i < maxFileCount+5; i++ {
		entries["impl/f"+itoa(i)+".go"] = "package x"
	}
	if _, err := Install(makeZip(t, entries), root, module); err == nil {
		t.Fatal("expected install to reject too many files")
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

func TestInstallRejectsMissingManifest(t *testing.T) {
	root := newRepo(t)
	pkg := makeZip(t, map[string]string{"impl/plugin.go": "package x"})
	if _, err := Install(pkg, root, module); err == nil {
		t.Fatal("expected install to reject package without plugin.json")
	}
}
