package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/xiaoqianran/capture-flow/internal/adapter"
	fakeadapter "github.com/xiaoqianran/capture-flow/internal/adapter/fake"
	genericweb "github.com/xiaoqianran/capture-flow/internal/adapter/genericweb"
	zhihuadapter "github.com/xiaoqianran/capture-flow/internal/adapter/zhihu"
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

	orch := orchestrator.New(st, adapters, r)
	server := api.New(orch)

	log.Printf("capture-flow hub listening on http://%s (data=%s)", *addr, absData)
	log.Printf("adapters: zhihu → generic-web → fake | collector: opencli")
	if err := http.ListenAndServe(*addr, server.Handler()); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
