package orchestrator_test

import (
	"context"
	"path/filepath"
	"strings"
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
		URL:  "fake://demo",
		Task: "full_text",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}

	done := waitDone(t, orch, job.ID)
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

func TestDedupSameHash(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "data"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	orch := orchestrator.New(st, []adapter.Adapter{fakeadapter.New()}, fakerunner.New())

	j1, err := orch.Submit(context.Background(), domain.CaptureTarget{URL: "fake://dedup"})
	if err != nil {
		t.Fatal(err)
	}
	d1 := waitDone(t, orch, j1.ID)
	if d1.Status != domain.JobDone {
		t.Fatalf("j1 status=%s %s", d1.Status, d1.ErrorMessage)
	}

	j2, err := orch.Submit(context.Background(), domain.CaptureTarget{URL: "fake://dedup"})
	if err != nil {
		t.Fatal(err)
	}
	d2 := waitDone(t, orch, j2.ID)
	if d2.Status != domain.JobDone {
		t.Fatalf("j2 status=%s %s", d2.Status, d2.ErrorMessage)
	}
	if d2.DocumentID != d1.DocumentID {
		t.Fatalf("doc ids differ: %s vs %s", d1.DocumentID, d2.DocumentID)
	}
	if d2.RevisionID != d1.RevisionID {
		t.Fatalf("expected same revision on dedup: %s vs %s", d1.RevisionID, d2.RevisionID)
	}
	joined := strings.Join(d2.Trace, "|")
	if !strings.Contains(joined, "dedup:same_hash") {
		t.Fatalf("trace missing dedup: %v", d2.Trace)
	}
}

func waitDone(t *testing.T, orch *orchestrator.Orchestrator, jobID string) *domain.Job {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		got, err := orch.GetJob(jobID)
		if err != nil {
			t.Fatalf("get job: %v", err)
		}
		if got.Status.IsTerminal() {
			return got
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("job did not finish in time")
	return nil
}
