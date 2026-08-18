package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// EnsureAIQueueSchema creates the persistent AI queue tables. It is intentionally
// separate from the base migration so queue storage can evolve independently.
func (s *Store) EnsureAIQueueSchema() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  response_id TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  next_retry_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue ON ai_jobs(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_document ON ai_jobs(document_id, revision_id, recipe_id, created_at DESC);
`)
	return err
}

// GetPacketByRevisionID reads an immutable packet revision. AI jobs use this to
// avoid processing a newer page revision that arrived while a job was queued.
func (s *Store) GetPacketByRevisionID(revisionID string) (*domain.ContentPacket, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.dataDir, "packets", revisionID+".json")
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, fmt.Errorf("revision not found: %s", revisionID)
	}
	if err != nil {
		return nil, err
	}
	var packet domain.ContentPacket
	if err := json.Unmarshal(raw, &packet); err != nil {
		return nil, err
	}
	return &packet, nil
}

// RequeueIncompleteCaptureJobs makes interrupted OpenCLI jobs durable across Hub restarts.
func (s *Store) RequeueIncompleteCaptureJobs() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
UPDATE jobs
SET status = ?, updated_at = ?
WHERE status IN (?, ?, ?, ?)`,
		string(domain.JobQueued), time.Now().UTC().Format(time.RFC3339Nano),
		string(domain.JobPlanning), string(domain.JobRunning), string(domain.JobNormalizing), string(domain.JobStored),
	)
	return err
}

// ClaimNextCaptureJob atomically reserves the oldest queued capture job for one worker.
func (s *Store) ClaimNextCaptureJob() (*domain.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	row := s.db.QueryRow(`
SELECT id, status, url, task, adapter, collector, document_id, revision_id,
       error_code, error_message, recoverable, trace_json, created_at, updated_at
FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1`, string(domain.JobQueued))
	job, err := scanJob(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	res, err := s.db.Exec(`UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
		string(domain.JobPlanning), now.Format(time.RFC3339Nano), job.ID, string(domain.JobQueued))
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil || n != 1 {
		return nil, err
	}
	job.Status = domain.JobPlanning
	job.UpdatedAt = now
	return job, nil
}

func (s *Store) SaveAIJob(job *domain.AIJob) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
INSERT INTO ai_jobs (
  id, document_id, revision_id, recipe_id, model, status, priority,
  attempts, max_attempts, response_id, error_message, created_at,
  started_at, updated_at, finished_at, next_retry_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  document_id=excluded.document_id,
  revision_id=excluded.revision_id,
  recipe_id=excluded.recipe_id,
  model=excluded.model,
  status=excluded.status,
  priority=excluded.priority,
  attempts=excluded.attempts,
  max_attempts=excluded.max_attempts,
  response_id=excluded.response_id,
  error_message=excluded.error_message,
  started_at=excluded.started_at,
  updated_at=excluded.updated_at,
  finished_at=excluded.finished_at,
  next_retry_at=excluded.next_retry_at
`,
		job.ID, job.DocumentID, job.RevisionID, job.RecipeID, job.Model, string(job.Status), job.Priority,
		job.Attempts, job.MaxAttempts, job.ResponseID, job.ErrorMessage,
		job.CreatedAt.UTC().Format(time.RFC3339Nano), nullableQueueTime(job.StartedAt),
		job.UpdatedAt.UTC().Format(time.RFC3339Nano), nullableQueueTime(job.FinishedAt), nullableQueueTime(job.NextRetryAt),
	)
	return err
}

func (s *Store) GetAIJob(id string) (*domain.AIJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	row := s.db.QueryRow(`
SELECT id, document_id, revision_id, recipe_id, model, status, priority,
       attempts, max_attempts, response_id, error_message, created_at,
       started_at, updated_at, finished_at, next_retry_at
FROM ai_jobs WHERE id = ?`, id)
	job, err := scanAIJob(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("ai job not found: %s", id)
	}
	return job, err
}

func (s *Store) ListAIJobs(limit int, status domain.AIJobStatus) ([]domain.AIJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	query := `
SELECT id, document_id, revision_id, recipe_id, model, status, priority,
       attempts, max_attempts, response_id, error_message, created_at,
       started_at, updated_at, finished_at, next_retry_at
FROM ai_jobs`
	args := []any{}
	if status != "" {
		query += ` WHERE status = ?`
		args = append(args, string(status))
	}
	query += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.AIJob
	for rows.Next() {
		job, err := scanAIJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *job)
	}
	return out, rows.Err()
}

// FindReusableAIJob prevents duplicate AI work for an unchanged document revision.
func (s *Store) FindReusableAIJob(documentID, revisionID, recipeID, model string) (*domain.AIJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	row := s.db.QueryRow(`
SELECT id, document_id, revision_id, recipe_id, model, status, priority,
       attempts, max_attempts, response_id, error_message, created_at,
       started_at, updated_at, finished_at, next_retry_at
FROM ai_jobs
WHERE document_id = ? AND revision_id = ? AND recipe_id = ? AND model = ?
  AND status IN (?, ?, ?, ?)
ORDER BY created_at DESC LIMIT 1`,
		documentID, revisionID, recipeID, model,
		string(domain.AIJobQueued), string(domain.AIJobRunning), string(domain.AIJobRetryWait), string(domain.AIJobDone),
	)
	job, err := scanAIJob(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return job, err
}

// RequeueRunningAIJobs recovers model calls interrupted by a Hub restart.
func (s *Store) RequeueRunningAIJobs() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
UPDATE ai_jobs
SET status = ?, started_at = NULL, updated_at = ?
WHERE status = ?`,
		string(domain.AIJobQueued), time.Now().UTC().Format(time.RFC3339Nano), string(domain.AIJobRunning),
	)
	return err
}

// ClaimNextAIJob reserves one due job. retry_wait jobs become eligible at next_retry_at.
func (s *Store) ClaimNextAIJob() (*domain.AIJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	row := s.db.QueryRow(`
SELECT id, document_id, revision_id, recipe_id, model, status, priority,
       attempts, max_attempts, response_id, error_message, created_at,
       started_at, updated_at, finished_at, next_retry_at
FROM ai_jobs
WHERE status = ? OR (status = ? AND (next_retry_at IS NULL OR next_retry_at <= ?))
ORDER BY priority DESC, created_at ASC LIMIT 1`,
		string(domain.AIJobQueued), string(domain.AIJobRetryWait), now.Format(time.RFC3339Nano),
	)
	job, err := scanAIJob(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	res, err := s.db.Exec(`
UPDATE ai_jobs
SET status = ?, attempts = attempts + 1, started_at = ?, updated_at = ?, next_retry_at = NULL
WHERE id = ? AND status IN (?, ?)`,
		string(domain.AIJobRunning), now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), job.ID,
		string(domain.AIJobQueued), string(domain.AIJobRetryWait),
	)
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil || n != 1 {
		return nil, err
	}
	job.Status = domain.AIJobRunning
	job.Attempts++
	job.StartedAt = &now
	job.UpdatedAt = now
	job.NextRetryAt = nil
	return job, nil
}

func (s *Store) FinishAIJob(id, responseID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`
UPDATE ai_jobs
SET status = ?, response_id = ?, error_message = '', updated_at = ?, finished_at = ?, next_retry_at = NULL
WHERE id = ?`, string(domain.AIJobDone), responseID, now, now, id)
	return err
}

func (s *Store) RetryAIJob(id, message string, next time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
UPDATE ai_jobs
SET status = ?, error_message = ?, updated_at = ?, finished_at = NULL, next_retry_at = ?
WHERE id = ?`,
		string(domain.AIJobRetryWait), message, time.Now().UTC().Format(time.RFC3339Nano), next.UTC().Format(time.RFC3339Nano), id,
	)
	return err
}

func (s *Store) FailAIJob(id, message string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`
UPDATE ai_jobs
SET status = ?, error_message = ?, updated_at = ?, finished_at = ?, next_retry_at = NULL
WHERE id = ?`, string(domain.AIJobFailed), message, now, now, id)
	return err
}

func (s *Store) AIQueueCounts() (map[domain.AIJobStatus]int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows, err := s.db.Query(`SELECT status, COUNT(*) FROM ai_jobs GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[domain.AIJobStatus]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		out[domain.AIJobStatus(status)] = count
	}
	return out, rows.Err()
}

func scanAIJob(row scannable) (*domain.AIJob, error) {
	var job domain.AIJob
	var status string
	var created, updated string
	var started, finished, nextRetry sql.NullString
	if err := row.Scan(
		&job.ID, &job.DocumentID, &job.RevisionID, &job.RecipeID, &job.Model, &status, &job.Priority,
		&job.Attempts, &job.MaxAttempts, &job.ResponseID, &job.ErrorMessage, &created,
		&started, &updated, &finished, &nextRetry,
	); err != nil {
		return nil, err
	}
	job.Status = domain.AIJobStatus(status)
	job.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	job.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updated)
	job.StartedAt = parseNullableQueueTime(started)
	job.FinishedAt = parseNullableQueueTime(finished)
	job.NextRetryAt = parseNullableQueueTime(nextRetry)
	return &job, nil
}

func nullableQueueTime(v *time.Time) any {
	if v == nil {
		return nil
	}
	return v.UTC().Format(time.RFC3339Nano)
}

func parseNullableQueueTime(v sql.NullString) *time.Time {
	if !v.Valid || v.String == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339Nano, v.String)
	if err != nil {
		return nil
	}
	return &t
}
