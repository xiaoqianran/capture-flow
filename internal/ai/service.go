package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

// PacketLoader loads a ContentPacket by document id.
type PacketLoader interface {
	GetPacketByDocumentID(documentID string) (*domain.ContentPacket, error)
	GetPacketByRevisionID(revisionID string) (*domain.ContentPacket, error)
}

// Service runs Recipe → Prompt → Dispatcher → Store.
type Service struct {
	store      *store.Store
	packets    PacketLoader
	dispatcher *Dispatcher
	recipes    map[string]domain.Recipe
}

func NewService(st *store.Store, packets PacketLoader, d *Dispatcher) *Service {
	return &Service{
		store:      st,
		packets:    packets,
		dispatcher: d,
		recipes:    BuiltinRecipes(),
	}
}

func (s *Service) ListRecipes() []domain.Recipe {
	return ListRecipes()
}

func (s *Service) GetRecipe(id string) (domain.Recipe, bool) {
	r, ok := s.recipes[id]
	return r, ok
}

func (s *Service) Configured() bool {
	return s.dispatcher != nil && s.dispatcher.Configured()
}

// NormalizeRequest validates a queued request and locks in recipe/model defaults at enqueue time.
func (s *Service) NormalizeRequest(req domain.RunAIRequest) (domain.RunAIRequest, error) {
	if req.DocumentID == "" {
		return req, fmt.Errorf("%s: document_id is required", domain.ErrInvalidTarget)
	}
	if !s.Configured() {
		return req, fmt.Errorf("%s: set AI API key or enable fake AI", domain.ErrAINotConfigured)
	}
	if req.RecipeID == "" {
		req.RecipeID = "summarize"
	}
	recipe, ok := s.recipes[req.RecipeID]
	if !ok {
		return req, fmt.Errorf("%s: unknown recipe %q", domain.ErrNotFound, req.RecipeID)
	}
	if req.Model == "" {
		req.Model = recipe.Model
	}
	if req.Model == "" {
		req.Model = s.dispatcher.DefaultModel()
	}
	return req, nil
}

// Run executes a recipe against the latest packet for document_id.
func (s *Service) Run(ctx context.Context, req domain.RunAIRequest) (*domain.AIResponse, error) {
	var err error
	req, err = s.NormalizeRequest(req)
	if err != nil {
		return nil, err
	}
	packet, err := s.packets.GetPacketByDocumentID(req.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrNotFound, err)
	}
	return s.runPacket(ctx, req, packet)
}

// RunRevision executes a queued request against the immutable revision bound at enqueue time.
func (s *Service) RunRevision(ctx context.Context, req domain.RunAIRequest, revisionID string) (*domain.AIResponse, error) {
	var err error
	req, err = s.NormalizeRequest(req)
	if err != nil {
		return nil, err
	}
	packet, err := s.packets.GetPacketByRevisionID(revisionID)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrNotFound, err)
	}
	if packet.DocumentID != req.DocumentID {
		return nil, fmt.Errorf("%s: revision %s does not belong to document %s", domain.ErrInvalidTarget, revisionID, req.DocumentID)
	}
	return s.runPacket(ctx, req, packet)
}

func (s *Service) runPacket(ctx context.Context, req domain.RunAIRequest, packet *domain.ContentPacket) (*domain.AIResponse, error) {
	recipe := s.recipes[req.RecipeID]
	userPrompt := BuildUserPrompt(recipe.UserTemplate, *packet)
	content, raw, usedModel, err := s.dispatcher.Complete(ctx, req.Model, recipe.SystemPrompt, userPrompt)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrAIFailed, err)
	}

	resp := &domain.AIResponse{
		ID:           "ai_" + uuid.NewString(),
		DocumentID:   packet.DocumentID,
		RevisionID:   packet.RevisionID,
		RecipeID:     recipe.ID,
		Model:        usedModel,
		Provider:     "openai-compatible",
		PromptSystem: recipe.SystemPrompt,
		PromptUser:   userPrompt,
		ContentMD:    content,
		RawJSON:      raw,
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.store.SaveAIResponse(resp); err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrStoreFailed, err)
	}
	return resp, nil
}

func (s *Service) GetResponse(id string) (*domain.AIResponse, error) {
	return s.store.GetAIResponse(id)
}

func (s *Service) ListResponses(documentID string) ([]domain.AIResponse, error) {
	return s.store.ListAIResponsesByDocument(documentID)
}
