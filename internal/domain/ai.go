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

// RunAIRequest is the REST body for POST /ai/run.
type RunAIRequest struct {
	DocumentID string `json:"document_id"`
	// RecipeID defaults to "summarize".
	RecipeID string `json:"recipe_id,omitempty"`
	// Model overrides recipe/hub default when set.
	Model string `json:"model,omitempty"`
}
