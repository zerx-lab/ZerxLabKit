// Package web embeds the built frontend SPA and serves it with sensible cache
// headers and a client-side-routing fallback.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// distFS holds the built SPA. `all:` includes dotfiles (e.g. the .gitkeep
// placeholder present before the frontend is built).
//
//go:embed all:dist
var distFS embed.FS

// SPAHandler serves the embedded SPA. Existing files are served with cache
// headers; unknown paths fall back to index.html for client-side routing. When
// the frontend has not been built (only the placeholder is present), it returns
// 503 with a build hint.
func SPAHandler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		// dist is embedded at compile time; a failure here is a programmer error.
		panic(err)
	}

	_, indexErr := fs.Stat(sub, "index.html")
	built := indexErr == nil

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !built {
			http.Error(w, "frontend not built; run: task build", http.StatusServiceUnavailable)
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}

		if info, statErr := fs.Stat(sub, name); statErr == nil && !info.IsDir() {
			setCacheHeaders(w, name)
			http.ServeFileFS(w, r, sub, name)
			return
		}

		// SPA fallback: serve index.html for client-side routes.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFileFS(w, r, sub, "index.html")
	})
}

func setCacheHeaders(w http.ResponseWriter, name string) {
	switch {
	case strings.HasPrefix(name, "assets/"):
		// Vite emits content-hashed filenames under assets/.
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	case strings.HasSuffix(name, ".html"):
		w.Header().Set("Cache-Control", "no-cache")
	}
}
