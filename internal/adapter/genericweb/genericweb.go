package genericweb

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// Adapter captures arbitrary http(s) pages via opencli web read --stdout.
// Site-specific adapters (e.g. zhihu) must be registered before this catch-all.
type Adapter struct{}

func New() *Adapter { return &Adapter{} }

func (a *Adapter) Name() string    { return "generic-web" }
func (a *Adapter) Version() string { return "1.0.0" }

func (a *Adapter) CanHandle(target domain.CaptureTarget) bool {
	u := strings.TrimSpace(target.URL)
	if u == "" {
		return false
	}
	// Do not steal fixture / non-http schemes.
	if strings.HasPrefix(u, "fake://") {
		return false
	}
	parsed, err := url.Parse(u)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return scheme == "http" || scheme == "https"
}

func (a *Adapter) Plan(target domain.CaptureTarget) (domain.CapturePlan, error) {
	rawURL := strings.TrimSpace(target.URL)
	task := target.Task
	if task == "" {
		task = "full_text"
	}
	if !a.CanHandle(target) {
		return domain.CapturePlan{}, fmt.Errorf("not an http(s) url: %s", rawURL)
	}

	// opencli web read --url <url> --stdout prints markdown to stdout.
	args := []string{
		"web", "read",
		"--url", rawURL,
		"--stdout",
		"--download-images=false",
		"--window", "background",
	}

	return domain.CapturePlan{
		Target: domain.CaptureTarget{
			URL:  rawURL,
			Task: task,
		},
		Adapter:        a.Name(),
		AdapterVersion: a.Version(),
		Collector:      domain.CollectorOpenCLI,
		Binary:         "opencli",
		Args:           args,
		Params: map[string]string{
			"kind": "page",
		},
		RequiredFields: []string{"title", "content_md"},
		TimeoutMS:      120000,
	}, nil
}

func (a *Adapter) Normalize(raw domain.RawResult, plan domain.CapturePlan) (domain.ContentPacket, error) {
	if raw.ExitCode != 0 {
		return domain.ContentPacket{}, fmt.Errorf("raw exit_code=%d stderr=%s", raw.ExitCode, truncate(raw.Stderr, 300))
	}
	md := strings.TrimSpace(raw.Stdout)
	// Drop trailing opencli update banners if mixed into stdout.
	md = stripTrailingBanner(md)
	if md == "" {
		return domain.ContentPacket{}, fmt.Errorf("empty markdown from opencli web read")
	}

	title := firstHeading(md)
	if title == "" {
		title = plan.Target.URL
	}
	author := ""

	return domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     domain.DocumentID(plan.Target.URL, "page"),
		RevisionID:     domain.RevisionID(),
		Source:         a.Name(),
		Type:           "page",
		URL:            plan.Target.URL,
		Title:          title,
		Author:         author,
		ContentMD:      md,
		ContentRaw:     raw.Stdout,
		Collector:      domain.CollectorOpenCLI,
		Adapter:        a.Name(),
		AdapterVersion: a.Version(),
		CapturedAt:     time.Now().UTC().Format(time.RFC3339),
		ContentHash:    domain.ContentHash(md),
	}, nil
}

func firstHeading(md string) string {
	for _, line := range strings.Split(md, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	return ""
}

func stripTrailingBanner(s string) string {
	// opencli sometimes appends update notices after content.
	markers := []string{
		"\n  Update available:",
		"\nUpdate available:",
	}
	for _, m := range markers {
		if i := strings.Index(s, m); i >= 0 {
			return strings.TrimSpace(s[:i])
		}
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
