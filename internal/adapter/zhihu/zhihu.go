package zhihu

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

var (
	reAnswer   = regexp.MustCompile(`(?i)zhihu\.com/question/\d+/answer/(\d+)`)
	reAnswerID = regexp.MustCompile(`(?i)(?:^|/)answer/(\d+)`)
	reArticle  = regexp.MustCompile(`(?i)zhuanlan\.zhihu\.com/p/(\d+)`)
	reQuestion = regexp.MustCompile(`(?i)zhihu\.com/question/(\d+)(?:/)?$`)
)

// Adapter maps Zhihu URLs to OpenCLI commands and normalizes JSON into ContentPacket.
type Adapter struct{}

func New() *Adapter { return &Adapter{} }

func (a *Adapter) Name() string    { return "zhihu" }
func (a *Adapter) Version() string { return "1.0.0" }

func (a *Adapter) CanHandle(target domain.CaptureTarget) bool {
	u := strings.TrimSpace(target.URL)
	if u == "" {
		return false
	}
	return strings.Contains(strings.ToLower(u), "zhihu.com")
}

func (a *Adapter) Plan(target domain.CaptureTarget) (domain.CapturePlan, error) {
	rawURL := strings.TrimSpace(target.URL)
	task := target.Task
	if task == "" {
		task = "full_text"
	}

	kind, opencliTarget, err := classify(rawURL)
	if err != nil {
		return domain.CapturePlan{}, err
	}

	var args []string
	switch kind {
	case "answer":
		// opencli zhihu answer-detail <url|id> -f json
		args = []string{
			"zhihu", "answer-detail", opencliTarget,
			"-f", "json",
			"--window", "background",
		}
	case "article":
		// opencli zhihu download --url <url> -f json
		// download writes markdown under --output; we also keep JSON metadata on stdout.
		args = []string{
			"zhihu", "download",
			"--url", opencliTarget,
			"--output", ".",
			"-f", "json",
			"--window", "background",
		}
	default:
		return domain.CapturePlan{}, fmt.Errorf("unsupported zhihu url kind %q", kind)
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
			"kind":           kind,
			"opencli_target": opencliTarget,
		},
		RequiredFields: []string{"title", "author", "content_md"},
		TimeoutMS:      120000,
	}, nil
}

func (a *Adapter) Normalize(raw domain.RawResult, plan domain.CapturePlan) (domain.ContentPacket, error) {
	if raw.ExitCode != 0 {
		return domain.ContentPacket{}, fmt.Errorf("raw exit_code=%d stderr=%s", raw.ExitCode, truncate(raw.Stderr, 300))
	}

	kind := plan.Params["kind"]
	payload, err := extractJSON(raw.Stdout)
	if err != nil {
		return domain.ContentPacket{}, fmt.Errorf("parse opencli json: %w", err)
	}

	switch kind {
	case "answer":
		return a.normalizeAnswer(payload, plan, raw.Stdout)
	case "article":
		return a.normalizeArticle(payload, plan, raw.Stdout)
	default:
		return domain.ContentPacket{}, fmt.Errorf("unknown plan kind %q", kind)
	}
}

func (a *Adapter) normalizeAnswer(payload json.RawMessage, plan domain.CapturePlan, rawStdout string) (domain.ContentPacket, error) {
	var item answerItem
	if err := decodeOne(payload, &item); err != nil {
		return domain.ContentPacket{}, err
	}
	if strings.TrimSpace(item.Content) == "" && strings.TrimSpace(item.ID) == "" {
		return domain.ContentPacket{}, fmt.Errorf("empty answer payload")
	}

	title := strings.TrimSpace(item.QuestionTitle)
	if title == "" {
		title = "知乎回答"
	}
	author := strings.TrimSpace(item.Author)
	content := strings.TrimSpace(item.Content)
	canonicalURL := strings.TrimSpace(item.URL)
	if canonicalURL == "" {
		canonicalURL = plan.Target.URL
	}

	body := content
	if title != "" {
		body = fmt.Sprintf("# %s\n\n%s", title, content)
	}

	return domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     domain.DocumentID(canonicalURL, "answer"),
		RevisionID:     domain.RevisionID(),
		Source:         a.Name(),
		Type:           "answer",
		URL:            canonicalURL,
		Title:          title,
		Author:         author,
		ContentMD:      body,
		ContentRaw:     rawStdout,
		Collector:      domain.CollectorOpenCLI,
		Adapter:        a.Name(),
		AdapterVersion: a.Version(),
		CapturedAt:     time.Now().UTC().Format(time.RFC3339),
		ContentHash:    domain.ContentHash(body),
	}, nil
}

func (a *Adapter) normalizeArticle(payload json.RawMessage, plan domain.CapturePlan, rawStdout string) (domain.ContentPacket, error) {
	var item articleItem
	if err := decodeOne(payload, &item); err != nil {
		return domain.ContentPacket{}, err
	}

	title := strings.TrimSpace(item.Title)
	if title == "" {
		title = "知乎文章"
	}
	author := strings.TrimSpace(item.Author)
	// download adapter may only return metadata; body fallback from status line.
	content := strings.TrimSpace(item.Content)
	if content == "" {
		content = strings.TrimSpace(item.Excerpt)
	}
	if content == "" {
		content = fmt.Sprintf("_Exported via opencli zhihu download (status=%s, size=%s)_", item.Status, item.Size)
	}

	canonicalURL := plan.Target.URL
	body := fmt.Sprintf("# %s\n\n%s", title, content)

	return domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     domain.DocumentID(canonicalURL, "article"),
		RevisionID:     domain.RevisionID(),
		Source:         a.Name(),
		Type:           "article",
		URL:            canonicalURL,
		Title:          title,
		Author:         author,
		ContentMD:      body,
		ContentRaw:     rawStdout,
		Collector:      domain.CollectorOpenCLI,
		Adapter:        a.Name(),
		AdapterVersion: a.Version(),
		CapturedAt:     time.Now().UTC().Format(time.RFC3339),
		ContentHash:    domain.ContentHash(body),
	}, nil
}

type answerItem struct {
	ID            string `json:"id"`
	Author        string `json:"author"`
	Votes         any    `json:"votes"`
	Comments      any    `json:"comments"`
	QuestionID    string `json:"question_id"`
	QuestionTitle string `json:"question_title"`
	URL           string `json:"url"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
	Content       string `json:"content"`
}

type articleItem struct {
	Title       string `json:"title"`
	Author      string `json:"author"`
	PublishTime string `json:"publish_time"`
	Status      string `json:"status"`
	Size        string `json:"size"`
	Content     string `json:"content"`
	Excerpt     string `json:"excerpt"`
	URL         string `json:"url"`
}

func classify(rawURL string) (kind, opencliTarget string, err error) {
	// Prefer answer over bare question.
	if m := reAnswer.FindStringSubmatch(rawURL); len(m) == 2 {
		return "answer", rawURL, nil
	}
	if m := reAnswerID.FindStringSubmatch(rawURL); len(m) == 2 {
		return "answer", m[1], nil
	}
	if m := reArticle.FindStringSubmatch(rawURL); len(m) == 2 {
		// download requires full URL
		if _, perr := url.Parse(rawURL); perr == nil {
			return "article", rawURL, nil
		}
		return "article", "https://zhuanlan.zhihu.com/p/" + m[1], nil
	}
	if reQuestion.MatchString(rawURL) {
		return "", "", fmt.Errorf("question URL is not enough for full_text; pass an answer URL (.../answer/<id>)")
	}
	return "", "", fmt.Errorf("unsupported zhihu url: %s", rawURL)
}

func extractJSON(stdout string) (json.RawMessage, error) {
	s := strings.TrimSpace(stdout)
	// opencli may print banners; find first JSON value.
	idxObj := strings.Index(s, "{")
	idxArr := strings.Index(s, "[")
	start := -1
	switch {
	case idxObj < 0 && idxArr < 0:
		return nil, fmt.Errorf("no json in stdout")
	case idxObj < 0:
		start = idxArr
	case idxArr < 0:
		start = idxObj
	default:
		if idxArr < idxObj {
			start = idxArr
		} else {
			start = idxObj
		}
	}
	s = s[start:]

	// Trim trailing non-json noise after the value.
	dec := json.NewDecoder(strings.NewReader(s))
	var raw json.RawMessage
	if err := dec.Decode(&raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func decodeOne(payload json.RawMessage, dest any) error {
	// Accept either object or single-element / multi-element array (use first).
	b := bytesTrim(payload)
	if len(b) > 0 && b[0] == '[' {
		var arr []json.RawMessage
		if err := json.Unmarshal(payload, &arr); err != nil {
			return err
		}
		if len(arr) == 0 {
			return fmt.Errorf("empty json array")
		}
		return json.Unmarshal(arr[0], dest)
	}
	return json.Unmarshal(payload, dest)
}

func bytesTrim(b []byte) []byte {
	return []byte(strings.TrimSpace(string(b)))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
