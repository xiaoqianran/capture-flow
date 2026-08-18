package domain

import "time"

// ContentPacketSchemaVersion is the locked protocol version for M1.
const ContentPacketSchemaVersion = "1.0.0"

// Collector identifiers. Browser DOM is the primary realtime collector; OpenCLI is the fallback collector.
const (
	CollectorBrowser = "browser-dom"
	CollectorOpenCLI = "opencli"
)

// BrowserCaptureRequest is a snapshot extracted from the currently rendered browser page.
// It intentionally carries content, not just a URL, so closing the tab cannot cancel downstream AI work.
type BrowserCaptureRequest struct {
	URL        string `json:"url"`
	Title      string `json:"title,omitempty"`
	Author     string `json:"author,omitempty"`
	ContentMD  string `json:"content_md"`
	ContentRaw string `json:"content_raw,omitempty"`
	Source     string `json:"source,omitempty"`
	Type       string `json:"type,omitempty"`
	CapturedAt string `json:"captured_at,omitempty"`
	AutoAI     bool   `json:"auto_ai,omitempty"`
	RecipeID   string `json:"recipe_id,omitempty"`
	Model      string `json:"model,omitempty"`
}

// CaptureReceipt is returned immediately after a browser snapshot is persisted.
type CaptureReceipt struct {
	DocumentID string `json:"document_id"`
	RevisionID string `json:"revision_id"`
	Deduped    bool   `json:"deduped"`
	AIJob      *AIJob `json:"ai_job,omitempty"`
	AIError    string `json:"ai_error,omitempty"`
}

// CaptureTarget is user intent.
type CaptureTarget struct {
	URL  string `json:"url"`
	Task string `json:"task,omitempty"`
}

// ContentPacket is the canonical snapshot after normalize.
type ContentPacket struct {
	SchemaVersion  string `json:"schema_version"`
	DocumentID     string `json:"document_id"`
	RevisionID     string `json:"revision_id"`
	Source         string `json:"source"`
	Type           string `json:"type"`
	URL            string `json:"url"`
	Title          string `json:"title"`
	Author         string `json:"author"`
	ContentMD      string `json:"content_md"`
	ContentRaw     string `json:"content_raw"`
	Collector      string `json:"collector"`
	Adapter        string `json:"adapter"`
	AdapterVersion string `json:"adapter_version"`
	CapturedAt     string `json:"captured_at"`
	ContentHash    string `json:"content_hash"`
}

// CapturePlan is a declarative execution plan from an adapter.
// Runner executes Args against Binary (default opencli); Adapter must not spawn processes.
type CapturePlan struct {
	Target         CaptureTarget `json:"target"`
	Adapter        string        `json:"adapter"`
	AdapterVersion string        `json:"adapter_version"`
	Collector      string        `json:"collector"`
	// Binary is the collector executable. Empty means runner default (opencli).
	Binary string `json:"binary,omitempty"`
	// Args are argv after the binary, e.g. ["zhihu","answer-detail",url,"-f","json"].
	Args           []string          `json:"args,omitempty"`
	Params         map[string]string `json:"params,omitempty"`
	RequiredFields []string          `json:"required_fields,omitempty"`
	TimeoutMS      int               `json:"timeout_ms,omitempty"`
}

// RawResult is runner output before normalize.
type RawResult struct {
	Stdout   string            `json:"stdout"`
	Stderr   string            `json:"stderr"`
	ExitCode int               `json:"exit_code"`
	Meta     map[string]string `json:"meta,omitempty"`
}

// Job is the orchestrator unit of work.
type Job struct {
	ID           string        `json:"id"`
	Status       JobStatus     `json:"status"`
	Target       CaptureTarget `json:"target"`
	Adapter      string        `json:"adapter,omitempty"`
	Collector    string        `json:"collector,omitempty"`
	DocumentID   string        `json:"document_id,omitempty"`
	RevisionID   string        `json:"revision_id,omitempty"`
	ErrorCode    ErrorCode     `json:"error_code,omitempty"`
	ErrorMessage string        `json:"error_message,omitempty"`
	Recoverable  bool          `json:"recoverable,omitempty"`
	Trace        []string      `json:"trace,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

// CreateJobRequest is the REST body for POST /jobs.
type CreateJobRequest struct {
	URL  string `json:"url"`
	Task string `json:"task,omitempty"`
}

// DocumentSummary is a library row without full content body.
type DocumentSummary struct {
	DocumentID    string `json:"document_id"`
	RevisionID    string `json:"revision_id"`
	Source        string `json:"source"`
	Type          string `json:"type"`
	URL           string `json:"url"`
	Title         string `json:"title"`
	Author        string `json:"author"`
	Collector     string `json:"collector"`
	Adapter       string `json:"adapter"`
	ContentHash   string `json:"content_hash"`
	SchemaVersion string `json:"schema_version"`
	CapturedAt    string `json:"captured_at"`
	UpdatedAt     string `json:"updated_at"`
}
