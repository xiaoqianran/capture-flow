package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
	_ "modernc.org/sqlite"
)

// Store persists jobs and content packets (SQLite + JSON files for packet body).
type Store struct {
	db      *sql.DB
	dataDir string
	mu      sync.Mutex
}

func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir data: %w", err)
	}
	packetDir := filepath.Join(dataDir, "packets")
	if err := os.MkdirAll(packetDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir packets: %w", err)
	}

	dbPath := filepath.Join(dataDir, "hub.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)

	s := &Store{db: db, dataDir: dataDir}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  url TEXT NOT NULL,
  task TEXT NOT NULL DEFAULT '',
  adapter TEXT NOT NULL DEFAULT '',
  collector TEXT NOT NULL DEFAULT '',
  document_id TEXT NOT NULL DEFAULT '',
  revision_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  recoverable INTEGER NOT NULL DEFAULT 0,
  trace_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  collector TEXT NOT NULL,
  adapter TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  packet_path TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`)
	return err
}

func (s *Store) SaveJob(job *domain.Job) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	trace, err := json.Marshal(job.Trace)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO jobs (
  id, status, url, task, adapter, collector, document_id, revision_id,
  error_code, error_message, recoverable, trace_json, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  status=excluded.status,
  url=excluded.url,
  task=excluded.task,
  adapter=excluded.adapter,
  collector=excluded.collector,
  document_id=excluded.document_id,
  revision_id=excluded.revision_id,
  error_code=excluded.error_code,
  error_message=excluded.error_message,
  recoverable=excluded.recoverable,
  trace_json=excluded.trace_json,
  updated_at=excluded.updated_at
`,
		job.ID, string(job.Status), job.Target.URL, job.Target.Task,
		job.Adapter, job.Collector, job.DocumentID, job.RevisionID,
		string(job.ErrorCode), job.ErrorMessage, boolToInt(job.Recoverable),
		string(trace),
		job.CreatedAt.UTC().Format(time.RFC3339Nano),
		job.UpdatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) GetJob(id string) (*domain.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	row := s.db.QueryRow(`
SELECT id, status, url, task, adapter, collector, document_id, revision_id,
       error_code, error_message, recoverable, trace_json, created_at, updated_at
FROM jobs WHERE id = ?`, id)

	var (
		job          domain.Job
		status       string
		errCode      string
		recoverable  int
		traceJSON    string
		created, upd string
	)
	err := row.Scan(
		&job.ID, &status, &job.Target.URL, &job.Target.Task,
		&job.Adapter, &job.Collector, &job.DocumentID, &job.RevisionID,
		&errCode, &job.ErrorMessage, &recoverable, &traceJSON, &created, &upd,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("job not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	job.Status = domain.JobStatus(status)
	job.ErrorCode = domain.ErrorCode(errCode)
	job.Recoverable = recoverable == 1
	_ = json.Unmarshal([]byte(traceJSON), &job.Trace)
	job.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	job.UpdatedAt, _ = time.Parse(time.RFC3339Nano, upd)
	return &job, nil
}

func (s *Store) SavePacket(packet domain.ContentPacket) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dataDir, "packets", packet.RevisionID+".json")
	raw, err := json.MarshalIndent(packet, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return err
	}

	_, err = s.db.Exec(`
INSERT INTO documents (
  document_id, revision_id, source, type, url, title, author,
  collector, adapter, content_hash, schema_version, captured_at, packet_path, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(document_id) DO UPDATE SET
  revision_id=excluded.revision_id,
  source=excluded.source,
  type=excluded.type,
  url=excluded.url,
  title=excluded.title,
  author=excluded.author,
  collector=excluded.collector,
  adapter=excluded.adapter,
  content_hash=excluded.content_hash,
  schema_version=excluded.schema_version,
  captured_at=excluded.captured_at,
  packet_path=excluded.packet_path,
  updated_at=excluded.updated_at
`,
		packet.DocumentID, packet.RevisionID, packet.Source, packet.Type,
		packet.URL, packet.Title, packet.Author, packet.Collector, packet.Adapter,
		packet.ContentHash, packet.SchemaVersion, packet.CapturedAt, path,
		time.Now().UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) GetPacketByDocumentID(documentID string) (*domain.ContentPacket, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var path string
	err := s.db.QueryRow(`SELECT packet_path FROM documents WHERE document_id = ?`, documentID).Scan(&path)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("document not found: %s", documentID)
	}
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var packet domain.ContentPacket
	if err := json.Unmarshal(raw, &packet); err != nil {
		return nil, err
	}
	return &packet, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
