package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/xiaoqianran/capture-flow/internal/adapter"
	fakeadapter "github.com/xiaoqianran/capture-flow/internal/adapter/fake"
	"github.com/xiaoqianran/capture-flow/internal/api"
	"github.com/xiaoqianran/capture-flow/internal/orchestrator"
	fakerunner "github.com/xiaoqianran/capture-flow/internal/runner/fake"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "HTTP listen address")
	dataDir := flag.String("data", "data", "data directory for sqlite and packets")
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

	orch := orchestrator.New(
		st,
		[]adapter.Adapter{fakeadapter.New()},
		fakerunner.New(),
	)
	server := api.New(orch)

	log.Printf("capture-flow hub listening on http://%s (data=%s)", *addr, absData)
	log.Printf("M1 path: POST /jobs → FakeAdapter → FakeRunner → ContentPacket → SQLite")
	if err := http.ListenAndServe(*addr, server.Handler()); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
