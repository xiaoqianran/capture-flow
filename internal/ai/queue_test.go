package ai_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/ai"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func TestAIQueueReusesSameRevision(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	saveQueuePacket(t, st, "doc_same", "rev_same", "same")

	svc := ai.NewService(st, st, ai.NewDispatcher(ai.Config{Fake: true, Model: "fake-model"}))
	q := ai.NewQueue(st, svc, 1, 3)
	t.Cleanup(q.Close)

	first, err := q.Enqueue(domain.RunAIRequest{DocumentID: "doc_same", RecipeID: "summarize"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := q.Enqueue(domain.RunAIRequest{DocumentID: "doc_same", RecipeID: "summarize"})
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID {
		t.Fatalf("duplicate job created: %s vs %s", first.ID, second.ID)
	}
	job := waitAIJob(t, q, first.ID)
	if job.Status != domain.AIJobDone || job.ResponseID == "" {
		t.Fatalf("job=%+v", job)
	}
}

func TestAIQueueHonorsConcurrency(t *testing.T) {
	var active atomic.Int32
	var peak atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := active.Add(1)
		defer active.Add(-1)
		for {
			old := peak.Load()
			if current <= old || peak.CompareAndSwap(old, current) {
				break
			}
		}
		time.Sleep(80 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"resp","model":"queue-test","choices":[{"message":{"role":"assistant","content":"ok"}}]}`))
	}))
	defer server.Close()

	st, err := store.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	svc := ai.NewService(st, st, ai.NewDispatcher(ai.Config{
		BaseURL: server.URL,
		APIKey:  "test-key",
		Model:   "queue-test",
	}))
	q := ai.NewQueue(st, svc, 2, 2)
	t.Cleanup(q.Close)

	ids := make([]string, 0, 6)
	for i := 0; i < 6; i++ {
		docID := fmt.Sprintf("doc_%d", i)
		revID := fmt.Sprintf("rev_%d", i)
		saveQueuePacket(t, st, docID, revID, fmt.Sprintf("content %d", i))
		job, err := q.Enqueue(domain.RunAIRequest{DocumentID: docID, RecipeID: "summarize"})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, job.ID)
	}
	for _, id := range ids {
		job := waitAIJob(t, q, id)
		if job.Status != domain.AIJobDone {
			t.Fatalf("%s status=%s err=%s", id, job.Status, job.ErrorMessage)
		}
	}
	if got := peak.Load(); got > 2 {
		t.Fatalf("peak concurrency=%d, want <=2", got)
	} else if got != 2 {
		t.Fatalf("peak concurrency=%d, expected worker pool to use both slots", got)
	}
}

func saveQueuePacket(t *testing.T, st *store.Store, documentID, revisionID, content string) {
	t.Helper()
	packet := domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     documentID,
		RevisionID:     revisionID,
		Source:         "test",
		Type:           "page",
		URL:            "https://example.com/" + documentID,
		Title:          documentID,
		ContentMD:      content,
		ContentRaw:     content,
		Collector:      domain.CollectorBrowser,
		Adapter:        "browser-dom",
		AdapterVersion: "1.0.0",
		CapturedAt:     time.Now().UTC().Format(time.RFC3339),
		ContentHash:    domain.ContentHash(content),
	}
	if err := st.SavePacket(packet); err != nil {
		t.Fatal(err)
	}
}

func waitAIJob(t *testing.T, q *ai.Queue, id string) *domain.AIJob {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, err := q.Get(id)
		if err != nil {
			t.Fatal(err)
		}
		if job.Status.IsTerminal() {
			return job
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("ai job %s did not finish", id)
	return nil
}
