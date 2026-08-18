package orchestrator_test

import (
	"path/filepath"
	"testing"

	"github.com/xiaoqianran/capture-flow/internal/adapter"
	fakeadapter "github.com/xiaoqianran/capture-flow/internal/adapter/fake"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/orchestrator"
	fakerunner "github.com/xiaoqianran/capture-flow/internal/runner/fake"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func TestBrowserSnapshotBypassesRunnerAndDedups(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	orch := orchestrator.NewWithConcurrency(st, []adapter.Adapter{fakeadapter.New()}, fakerunner.New(), 1)
	t.Cleanup(orch.Close)

	req := domain.BrowserCaptureRequest{
		URL:        "https://example.com/posts/1",
		Title:      "Live DOM",
		ContentMD:  "# Live DOM\n\nrendered browser content",
		ContentRaw: "<article>rendered browser content</article>",
		Source:     "example.com",
		Type:       "page",
	}
	first, err := orch.CaptureSnapshot(req)
	if err != nil {
		t.Fatal(err)
	}
	if first.Deduped || first.DocumentID == "" || first.RevisionID == "" {
		t.Fatalf("bad receipt: %+v", first)
	}
	packet, err := orch.GetDocument(first.DocumentID)
	if err != nil {
		t.Fatal(err)
	}
	if packet.Collector != domain.CollectorBrowser || packet.Adapter != "browser-dom" {
		t.Fatalf("collector=%s adapter=%s", packet.Collector, packet.Adapter)
	}
	if packet.ContentMD != req.ContentMD {
		t.Fatalf("content mismatch: %q", packet.ContentMD)
	}

	second, err := orch.CaptureSnapshot(req)
	if err != nil {
		t.Fatal(err)
	}
	if !second.Deduped || second.RevisionID != first.RevisionID {
		t.Fatalf("expected same revision on dedup: first=%+v second=%+v", first, second)
	}
}
