package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestIsAPIPath(t *testing.T) {
	cases := map[string]bool{
		"/health":                 true,
		"/jobs":                   true,
		"/jobs/job_1":             true,
		"/docs":                   true,
		"/docs/doc_1":             true,
		"/docs/doc_1/ai":          true,
		"/recipes":                true,
		"/ai/run":                 true,
		"/ai/responses/ai_1":      true,
		"/":                       false,
		"/assets/index.js":        false,
		"/index.html":             false,
	}
	for p, want := range cases {
		if got := isAPIPath(p); got != want {
			t.Fatalf("%s: got %v want %v", p, got, want)
		}
	}
}

func TestStaticUIServesIndex(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>hub-ui</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("console.log(1)"), 0o644); err != nil {
		t.Fatal(err)
	}

	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	h := withStaticUI(api, dir)

	// API still works
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rr.Code != 200 || rr.Body.String() != `{"status":"ok"}` {
		t.Fatalf("api: code=%d body=%s", rr.Code, rr.Body.String())
	}

	// index
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/", nil))
	if rr.Code != 200 || rr.Body.String() != "<html>hub-ui</html>" {
		t.Fatalf("index: code=%d body=%s", rr.Code, rr.Body.String())
	}

	// asset
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if rr.Code != 200 || rr.Body.String() != "console.log(1)" {
		t.Fatalf("asset: code=%d body=%s", rr.Code, rr.Body.String())
	}
}
