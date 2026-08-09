package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/ai"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/orchestrator"
)

// Server exposes REST endpoints for the hub.
type Server struct {
	orch *orchestrator.Orchestrator
	ai   *ai.Service
	mux  *http.ServeMux
}

func New(orch *orchestrator.Orchestrator, aiSvc *ai.Service) *Server {
	s := &Server{orch: orch, ai: aiSvc, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /jobs", s.handleCreateJob)
	s.mux.HandleFunc("GET /jobs/{id}", s.handleGetJob)
	s.mux.HandleFunc("GET /docs/{id}", s.handleGetDoc)

	s.mux.HandleFunc("GET /recipes", s.handleListRecipes)
	s.mux.HandleFunc("POST /ai/run", s.handleAIRun)
	s.mux.HandleFunc("GET /ai/responses/{id}", s.handleGetAIResponse)
	s.mux.HandleFunc("GET /docs/{id}/ai", s.handleListDocAI)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	aiOK := s.ai != nil && s.ai.Configured()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"time":         time.Now().UTC().Format(time.RFC3339),
		"ai_configured": aiOK,
	})
}

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	var req domain.CreateJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, domain.ErrInvalidTarget, "invalid json body")
		return
	}
	req.URL = strings.TrimSpace(req.URL)
	if req.URL == "" {
		writeErr(w, http.StatusBadRequest, domain.ErrInvalidTarget, "url is required")
		return
	}

	job, err := s.orch.Submit(r.Context(), domain.CaptureTarget{URL: req.URL, Task: req.Task})
	if err != nil {
		writeErr(w, http.StatusBadRequest, domain.ErrInvalidTarget, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	job, err := s.orch.GetJob(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, domain.ErrNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) handleGetDoc(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	packet, err := s.orch.GetDocument(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, domain.ErrNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, packet)
}

func (s *Server) handleListRecipes(w http.ResponseWriter, r *http.Request) {
	if s.ai == nil {
		writeJSON(w, http.StatusOK, []domain.Recipe{})
		return
	}
	writeJSON(w, http.StatusOK, s.ai.ListRecipes())
}

func (s *Server) handleAIRun(w http.ResponseWriter, r *http.Request) {
	if s.ai == nil {
		writeErr(w, http.StatusServiceUnavailable, domain.ErrAINotConfigured, "ai service unavailable")
		return
	}
	var req domain.RunAIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, domain.ErrInvalidTarget, "invalid json body")
		return
	}
	req.DocumentID = strings.TrimSpace(req.DocumentID)
	resp, err := s.ai.Run(r.Context(), req)
	if err != nil {
		code, status := classifyAIErr(err)
		writeErr(w, status, code, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetAIResponse(w http.ResponseWriter, r *http.Request) {
	if s.ai == nil {
		writeErr(w, http.StatusServiceUnavailable, domain.ErrAINotConfigured, "ai service unavailable")
		return
	}
	id := r.PathValue("id")
	resp, err := s.ai.GetResponse(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, domain.ErrNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleListDocAI(w http.ResponseWriter, r *http.Request) {
	if s.ai == nil {
		writeJSON(w, http.StatusOK, []domain.AIResponse{})
		return
	}
	id := r.PathValue("id")
	list, err := s.ai.ListResponses(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, domain.ErrInternal, err.Error())
		return
	}
	if list == nil {
		list = []domain.AIResponse{}
	}
	writeJSON(w, http.StatusOK, list)
}

func classifyAIErr(err error) (domain.ErrorCode, int) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, string(domain.ErrAINotConfigured)):
		return domain.ErrAINotConfigured, http.StatusServiceUnavailable
	case strings.Contains(msg, string(domain.ErrNotFound)):
		return domain.ErrNotFound, http.StatusNotFound
	case strings.Contains(msg, string(domain.ErrInvalidTarget)):
		return domain.ErrInvalidTarget, http.StatusBadRequest
	case strings.Contains(msg, string(domain.ErrAIFailed)):
		return domain.ErrAIFailed, http.StatusBadGateway
	case strings.Contains(msg, string(domain.ErrStoreFailed)):
		return domain.ErrStoreFailed, http.StatusInternalServerError
	default:
		return domain.ErrInternal, http.StatusInternalServerError
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code domain.ErrorCode, msg string) {
	writeJSON(w, status, map[string]any{
		"error_code":    code,
		"error_message": msg,
		"recoverable":   code.Recoverable(),
	})
}
