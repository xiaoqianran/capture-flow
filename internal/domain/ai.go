package domain

import "time"

// Recipe is a reusable AI prompt formula bound to ContentPacket fields.
type Recipe struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description,omitempty"`
	SystemPrompt string `json:"system_prompt"`
	// UserTemplate supports placeholders: {{title}} {{author}} {{url}} {{content_md}} {{source}} {{type}}
	UserTemplate string `json:"user_template"`
	// Model empty → hub default model.
	Model string `json:"model,omitempty"`
}

// AIResponse is one model completion bound to a document revision + recipe.
type AIResponse struct {
	ID           string    `json:"id"`
	DocumentID   string    `json:"document_id"`
	RevisionID   string    `json:"revision_id"`
	RecipeID     string    `json:"recipe_id"`
	Model        string    `json:"model"`
	Provider     string    `json:"provider,omitempty"`
	PromptSystem string    `json:"prompt_system,omitempty"`
	PromptUser   string    `json:"prompt_user,omitempty"`
	ContentMD    string    `json:"content_md"`
	RawJSON      string    `json:"raw_json,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// RunAIRequest describes one AI recipe invocation.
type RunAIRequest struct {
	DocumentID string `json:"document_id"`
	// RecipeID defaults to "summarize".
	RecipeID string `json:"recipe_id,omitempty"`
	// Model overrides recipe/hub default when set.
	Model string `json:"model,omitempty"`
}

// AIJobStatus is the persistent queue lifecycle for model calls.
type AIJobStatus string

const (
	AIJobQueued    AIJobStatus = "queued"
	AIJobRunning   AIJobStatus = "running"
	AIJobRetryWait AIJobStatus = "retry_wait"
	AIJobDone      AIJobStatus = "done"
	AIJobFailed    AIJobStatus = "failed"
	AIJobCancelled AIJobStatus = "cancelled"
)

func (s AIJobStatus) IsTerminal() bool {
	return s == AIJobDone || s == AIJobFailed || s == AIJobCancelled
}

// AIJob is a durable model request consumed by the Hub worker pool.
type AIJob struct {
	ID           string      `json:"id"`
	DocumentID   string      `json:"document_id"`
	RevisionID   string      `json:"revision_id"`
	RecipeID     string      `json:"recipe_id"`
	Model        string      `json:"model,omitempty"`
	Status       AIJobStatus `json:"status"`
	Priority     int         `json:"priority"`
	Attempts     int         `json:"attempts"`
	MaxAttempts  int         `json:"max_attempts"`
	ResponseID   string      `json:"response_id,omitempty"`
	ErrorMessage string      `json:"error_message,omitempty"`
	CreatedAt    time.Time   `json:"created_at"`
	StartedAt    *time.Time  `json:"started_at,omitempty"`
	UpdatedAt    time.Time   `json:"updated_at"`
	FinishedAt   *time.Time  `json:"finished_at,omitempty"`
	NextRetryAt  *time.Time  `json:"next_retry_at,omitempty"`
}

// AIQueueStats is a lightweight snapshot for the UI and health endpoint.
type AIQueueStats struct {
	Concurrency int `json:"concurrency"`
	Queued      int `json:"queued"`
	Running     int `json:"running"`
	RetryWait   int `json:"retry_wait"`
	Done        int `json:"done"`
	Failed      int `json:"failed"`
}
