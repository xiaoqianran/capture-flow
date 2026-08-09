package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/orchestrator"
)

// Server exposes REST endpoints for the hub.
type Server struct {
	orch *orchestrator.Orchestrator
	mux  *http.ServeMux
}

func New(orch *orchestrator.Orchestrator) *Server {
	s := &Server{orch: orch, mux: http.NewServeMux()}
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
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
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
		writeErr(w, http.StatusNotFound, domain.ErrInternal, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) handleGetDoc(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	packet, err := s.orch.GetDocument(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, domain.ErrInternal, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, packet)
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
