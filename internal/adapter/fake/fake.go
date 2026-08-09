package fake

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// Adapter is a fixture adapter used to prove the M1 pipeline.
type Adapter struct{}

func New() *Adapter { return &Adapter{} }

func (a *Adapter) Name() string    { return "fake" }
func (a *Adapter) Version() string { return "1.0.0" }

func (a *Adapter) CanHandle(target domain.CaptureTarget) bool {
	return strings.TrimSpace(target.URL) != ""
}

func (a *Adapter) Plan(target domain.CaptureTarget) (domain.CapturePlan, error) {
	task := target.Task
	if task == "" {
		task = "full_text"
	}
	return domain.CapturePlan{
		Target: domain.CaptureTarget{
			URL:  target.URL,
			Task: task,
		},
		Adapter:        a.Name(),
		AdapterVersion: a.Version(),
		Collector:      domain.CollectorOpenCLI,
		Params: map[string]string{
			"mode": "fixture",
			"url":  target.URL,
		},
		RequiredFields: []string{"title", "content_md"},
		TimeoutMS:      5000,
	}, nil
}

func (a *Adapter) Normalize(raw domain.RawResult, plan domain.CapturePlan) (domain.ContentPacket, error) {
	if raw.ExitCode != 0 {
		return domain.ContentPacket{}, fmt.Errorf("raw exit_code=%d stderr=%s", raw.ExitCode, raw.Stderr)
	}

	title := raw.Meta["title"]
	if title == "" {
		title = "Fake Document"
	}
	author := raw.Meta["author"]
	if author == "" {
		author = "fake-author"
	}
	body := strings.TrimSpace(raw.Stdout)
	if body == "" {
		body = "empty fixture body"
	}

	docID := documentID(plan.Target.URL, "page")
	revID := fmt.Sprintf("rev_%d", time.Now().UTC().UnixNano())
	hash := contentHash(body)
	now := time.Now().UTC().Format(time.RFC3339)

	return domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     docID,
		RevisionID:     revID,
		Source:         a.Name(),
		Type:           "page",
		URL:            plan.Target.URL,
		Title:          title,
		Author:         author,
		ContentMD:      body,
		ContentRaw:     raw.Stdout,
		Collector:      domain.CollectorOpenCLI,
		Adapter:        a.Name(),
		AdapterVersion: a.Version(),
		CapturedAt:     now,
		ContentHash:    hash,
	}, nil
}

func documentID(url, docType string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(url) + "|" + docType))
	return "doc_" + hex.EncodeToString(sum[:8])
}

func contentHash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return "sha256:" + hex.EncodeToString(sum[:])
}
