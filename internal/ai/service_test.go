package ai_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/xiaoqianran/capture-flow/internal/ai"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

func TestRunFakeAI(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	packet := domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     "doc_ai",
		RevisionID:     "rev_ai",
		Source:         "fake",
		Type:           "page",
		URL:            "fake://ai",
		Title:          "AI Doc",
		Author:         "tester",
		ContentMD:      "# AI Doc\n\nSome content for summary.",
		ContentRaw:     "raw",
		Collector:      domain.CollectorOpenCLI,
		Adapter:        "fake",
		AdapterVersion: "1.0.0",
		CapturedAt:     "2026-01-01T00:00:00Z",
		ContentHash:    domain.ContentHash("Some content for summary."),
	}
	if err := st.SavePacket(packet); err != nil {
		t.Fatal(err)
	}

	svc := ai.NewService(st, st, ai.NewDispatcher(ai.Config{Fake: true, Model: "fake-model"}))
	resp, err := svc.Run(context.Background(), domain.RunAIRequest{
		DocumentID: "doc_ai",
		RecipeID:   "summarize",
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.ID == "" || resp.ContentMD == "" {
		t.Fatalf("empty response: %+v", resp)
	}
	if resp.DocumentID != "doc_ai" || resp.RevisionID != "rev_ai" {
		t.Fatalf("binding mismatch: %+v", resp)
	}
	if resp.RecipeID != "summarize" {
		t.Fatalf("recipe=%s", resp.RecipeID)
	}

	got, err := svc.GetResponse(resp.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ContentMD != resp.ContentMD {
		t.Fatal("get mismatch")
	}
	list, err := svc.ListResponses("doc_ai")
	if err != nil || len(list) != 1 {
		t.Fatalf("list=%v err=%v", list, err)
	}
}
