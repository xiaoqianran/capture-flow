package orchestrator_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/adapter"
	fakeadapter "github.com/xiaoqianran/capture-flow/internal/adapter/fake"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/orchestrator"
	fakerunner "github.com/xiaoqianran/capture-flow/internal/runner/fake"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func TestSubmitFakePipeline(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "data"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	orch := orchestrator.New(st, []adapter.Adapter{fakeadapter.New()}, fakerunner.New())
	job, err := orch.Submit(context.Background(), domain.CaptureTarget{
		URL:  "https://example.com/fake",
		Task: "full_text",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}

	var done *domain.Job
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		got, err := orch.GetJob(job.ID)
		if err != nil {
			t.Fatalf("get job: %v", err)
		}
		if got.Status.IsTerminal() {
			done = got
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if done == nil {
		t.Fatal("job did not finish in time")
	}
	if done.Status != domain.JobDone {
		t.Fatalf("status=%s err=%s %s", done.Status, done.ErrorCode, done.ErrorMessage)
	}
	if done.DocumentID == "" {
		t.Fatal("missing document_id")
	}

	packet, err := orch.GetDocument(done.DocumentID)
	if err != nil {
		t.Fatalf("get doc: %v", err)
	}
	if packet.SchemaVersion != domain.ContentPacketSchemaVersion {
		t.Fatalf("schema_version=%s", packet.SchemaVersion)
	}
	if packet.Collector != domain.CollectorOpenCLI {
		t.Fatalf("collector=%s", packet.Collector)
	}
	if packet.Adapter != "fake" {
		t.Fatalf("adapter=%s", packet.Adapter)
	}
	if packet.ContentHash == "" || packet.ContentMD == "" {
		t.Fatal("packet content incomplete")
	}
}
