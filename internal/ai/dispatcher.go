package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Config configures an OpenAI-compatible chat client.
type Config struct {
	BaseURL string // e.g. https://api.openai.com/v1
	APIKey  string
	Model   string
	// HTTPClient optional; defaults to 120s timeout client.
	HTTPClient *http.Client
	// Fake returns deterministic text without network (tests / offline).
	Fake bool
}

// Dispatcher talks to OpenAI-compatible /chat/completions.
type Dispatcher struct {
	cfg Config
}

func NewDispatcher(cfg Config) *Dispatcher {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.openai.com/v1"
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.Model == "" {
		cfg.Model = "gpt-4o-mini"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 120 * time.Second}
	}
	return &Dispatcher{cfg: cfg}
}

func (d *Dispatcher) DefaultModel() string { return d.cfg.Model }

func (d *Dispatcher) Configured() bool {
	return d.cfg.Fake || strings.TrimSpace(d.cfg.APIKey) != ""
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

// Complete runs a non-streaming chat completion.
func (d *Dispatcher) Complete(ctx context.Context, model, system, user string) (content string, rawJSON string, usedModel string, err error) {
	if model == "" {
		model = d.cfg.Model
	}
	if d.cfg.Fake {
		body := fmt.Sprintf("## Fake AI (%s)\n\n**System intent**: %s\n\n**User excerpt**:\n\n%s\n",
			model, firstLine(system), truncate(user, 400))
		raw, _ := json.Marshal(map[string]any{
			"fake":    true,
			"model":   model,
			"content": body,
		})
		return body, string(raw), model, nil
	}
	if strings.TrimSpace(d.cfg.APIKey) == "" {
		return "", "", model, fmt.Errorf("ai api key not configured")
	}

	reqBody := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", model, err
	}

	endpoint := d.cfg.BaseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", "", model, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+d.cfg.APIKey)

	resp, err := d.cfg.HTTPClient.Do(req)
	if err != nil {
		return "", "", model, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", model, err
	}
	rawJSON = string(raw)

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", rawJSON, model, fmt.Errorf("decode ai response: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return "", rawJSON, model, fmt.Errorf("ai error: %s", parsed.Error.Message)
	}
	if resp.StatusCode >= 300 {
		return "", rawJSON, model, fmt.Errorf("ai http %s: %s", resp.Status, truncate(rawJSON, 300))
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", rawJSON, model, fmt.Errorf("ai returned empty choices")
	}
	usedModel = parsed.Model
	if usedModel == "" {
		usedModel = model
	}
	return parsed.Choices[0].Message.Content, rawJSON, usedModel, nil
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return truncate(s, 120)
}

func truncate(s string, n int) string {
	if n <= 0 {
		return ""
	}
	// n is a soft byte budget; cut on rune boundary to avoid invalid UTF-8.
	if len(s) <= n {
		return s
	}
	r := []rune(s)
	// Approximate: keep runes until byte length would exceed n.
	var b strings.Builder
	for _, ch := range r {
		next := b.Len() + len(string(ch))
		if next > n {
			break
		}
		b.WriteRune(ch)
	}
	if b.Len() == 0 {
		return "..."
	}
	return b.String() + "..."
}
