package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/xiaoqianran/capture-flow/internal/adapter"
	fakeadapter "github.com/xiaoqianran/capture-flow/internal/adapter/fake"
	genericweb "github.com/xiaoqianran/capture-flow/internal/adapter/genericweb"
	zhihuadapter "github.com/xiaoqianran/capture-flow/internal/adapter/zhihu"
	"github.com/xiaoqianran/capture-flow/internal/ai"
	"github.com/xiaoqianran/capture-flow/internal/api"
	"github.com/xiaoqianran/capture-flow/internal/orchestrator"
	"github.com/xiaoqianran/capture-flow/internal/runner"
	clirunner "github.com/xiaoqianran/capture-flow/internal/runner/cli"
	fakerunner "github.com/xiaoqianran/capture-flow/internal/runner/fake"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "HTTP listen address")
	dataDir := flag.String("data", "data", "data directory for sqlite and packets")
	opencliBin := flag.String("opencli", "opencli", "opencli executable name or path")
	useFakeRunner := flag.Bool("fake-runner", false, "use FakeRunner instead of real OpenCLI (dev only)")
	webDir := flag.String("web-dir", envOr("CAPTURE_FLOW_WEB_DIR", "web/dist"), "directory of built Local Hub UI (empty disables)")
	captureConcurrency := flag.Int("capture-concurrency", envInt("CAPTURE_FLOW_CAPTURE_CONCURRENCY", 2), "max concurrent OpenCLI fallback captures")

	aiBase := flag.String("ai-base-url", envOr("CAPTURE_FLOW_AI_BASE_URL", "https://api.openai.com/v1"), "OpenAI-compatible API base URL")
	aiKey := flag.String("ai-api-key", envOr("CAPTURE_FLOW_AI_API_KEY", ""), "OpenAI-compatible API key")
	aiModel := flag.String("ai-model", envOr("CAPTURE_FLOW_AI_MODEL", "gpt-4o-mini"), "default chat model")
	fakeAI := flag.Bool("fake-ai", envOr("CAPTURE_FLOW_FAKE_AI", "") == "1", "use Fake AI dispatcher (no network)")
	aiConcurrency := flag.Int("ai-concurrency", envInt("CAPTURE_FLOW_AI_CONCURRENCY", 5), "max concurrent AI requests")
	aiMaxAttempts := flag.Int("ai-max-attempts", envInt("CAPTURE_FLOW_AI_MAX_ATTEMPTS", 3), "AI queue attempts before permanent failure")
	flag.Parse()

	absData, err := filepath.Abs(*dataDir)
	if err != nil {
		log.Fatalf("resolve data dir: %v", err)
	}
	if err := os.MkdirAll(absData, 0o755); err != nil {
		log.Fatalf("mkdir data: %v", err)
	}

	st, err := store.Open(absData)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	// Registry order: specific sites → catch-all generic-web → fixture fake.
	adapters := []adapter.Adapter{
		zhihuadapter.New(),
		genericweb.New(),
		fakeadapter.New(),
	}

	var r runner.Runner
	if *useFakeRunner {
		r = fakerunner.New()
		log.Printf("runner: FakeRunner (dev)")
	} else {
		r = clirunner.New(*opencliBin)
		log.Printf("runner: CLI OpenCLI binary=%s", *opencliBin)
	}

	orch := orchestrator.NewWithConcurrency(st, adapters, r, *captureConcurrency)
	defer orch.Close()

	disp := ai.NewDispatcher(ai.Config{
		BaseURL: *aiBase,
		APIKey:  *aiKey,
		Model:   *aiModel,
		Fake:    *fakeAI,
	})
	aiSvc := ai.NewService(st, st, disp)
	aiQueue := ai.NewQueue(st, aiSvc, *aiConcurrency, *aiMaxAttempts)
	defer aiQueue.Close()
	if *fakeAI {
		log.Printf("ai: Fake dispatcher model=%s", *aiModel)
	} else if *aiKey != "" {
		log.Printf("ai: OpenAI-compatible base=%s model=%s", *aiBase, *aiModel)
	} else {
		log.Printf("ai: not configured (set -ai-api-key or CAPTURE_FLOW_AI_API_KEY; or -fake-ai)")
	}

	staticDir := resolveWebDir(*webDir)
	server := api.NewWithWeb(orch, aiSvc, aiQueue, staticDir)

	log.Printf("capture-flow hub listening on http://%s (data=%s)", *addr, absData)
	if staticDir != "" {
		log.Printf("ui: serving Local Hub from %s  →  http://%s/", staticDir, *addr)
	} else {
		log.Printf("ui: disabled (build web with `cd web && bun run build`, or set -web-dir)")
	}
	log.Printf("capture: browser-dom primary | OpenCLI fallback concurrency=%d", orch.Concurrency())
	log.Printf("ai queue: concurrency=%d max_attempts=%d", aiQueue.Concurrency(), *aiMaxAttempts)
	log.Printf("adapters: zhihu → generic-web → fake")
	if err := http.ListenAndServe(*addr, server.Handler()); err != nil {
		log.Fatalf("listen: %v", err)
	}
}

func resolveWebDir(dir string) string {
	dir = strings.TrimSpace(dir)
	if dir == "" || dir == "-" || dir == "off" {
		return ""
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		log.Printf("ui: ignore web-dir %q: %v", dir, err)
		return ""
	}
	info, err := os.Stat(filepath.Join(abs, "index.html"))
	if err != nil || info.IsDir() {
		log.Printf("ui: web-dir %s has no index.html (run: cd web && bun run build)", abs)
		return ""
	}
	return abs
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
