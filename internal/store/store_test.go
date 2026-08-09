package store_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func TestSavePacketIfChangedDedup(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	p1 := domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     "doc_x",
		RevisionID:     "rev_1",
		Source:         "fake",
		Type:           "page",
		URL:            "fake://x",
		Title:          "t",
		Author:         "a",
		ContentMD:      "hello",
		ContentRaw:     "hello",
		Collector:      domain.CollectorOpenCLI,
		Adapter:        "fake",
		AdapterVersion: "1.0.0",
		CapturedAt:     "2026-01-01T00:00:00Z",
		ContentHash:    domain.ContentHash("hello"),
	}
	rev, deduped, err := st.SavePacketIfChanged(p1)
	if err != nil || deduped || rev != "rev_1" {
		t.Fatalf("first save: rev=%s deduped=%v err=%v", rev, deduped, err)
	}

	p2 := p1
	p2.RevisionID = "rev_2"
	rev, deduped, err = st.SavePacketIfChanged(p2)
	if err != nil {
		t.Fatal(err)
	}
	if !deduped || rev != "rev_1" {
		t.Fatalf("expected dedup rev_1, got rev=%s deduped=%v", rev, deduped)
	}

	p3 := p1
	p3.RevisionID = "rev_3"
	p3.ContentMD = "hello changed"
	p3.ContentHash = domain.ContentHash(p3.ContentMD)
	rev, deduped, err = st.SavePacketIfChanged(p3)
	if err != nil || deduped || rev != "rev_3" {
		t.Fatalf("changed content: rev=%s deduped=%v err=%v", rev, deduped, err)
	}
}

func TestListJobsAndDocuments(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	job := &domain.Job{
		ID:        "job_list_1",
		Status:    domain.JobDone,
		Target:    domain.CaptureTarget{URL: "fake://list", Task: "full_text"},
		Trace:     []string{"queued", "done"},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	if err := st.SaveJob(job); err != nil {
		t.Fatal(err)
	}
	jobs, err := st.ListJobs(10)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("jobs=%v err=%v", jobs, err)
	}

	p := domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     "doc_list",
		RevisionID:     "rev_list",
		Source:         "fake",
		Type:           "page",
		URL:            "fake://list",
		Title:          "List Doc",
		Author:         "a",
		ContentMD:      "body",
		ContentRaw:     "body",
		Collector:      domain.CollectorOpenCLI,
		Adapter:        "fake",
		AdapterVersion: "1.0.0",
		CapturedAt:     "2026-01-01T00:00:00Z",
		ContentHash:    domain.ContentHash("body"),
	}
	if err := st.SavePacket(p); err != nil {
		t.Fatal(err)
	}
	docs, err := st.ListDocuments(10)
	if err != nil || len(docs) != 1 || docs[0].Title != "List Doc" {
		t.Fatalf("docs=%v err=%v", docs, err)
	}
}
