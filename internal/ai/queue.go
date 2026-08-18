package ai

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

// Queue is a durable fixed-concurrency worker pool for model calls.
type Queue struct {
	store       *store.Store
	service     *Service
	concurrency int
	maxAttempts int
	wake        chan struct{}
	stop        chan struct{}
	wg          sync.WaitGroup
	closeOnce   sync.Once
	enqueueMu   sync.Mutex
}

func NewQueue(st *store.Store, service *Service, concurrency, maxAttempts int) *Queue {
	if concurrency <= 0 {
		concurrency = 1
	}
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	q := &Queue{
		store:       st,
		service:     service,
		concurrency: concurrency,
		maxAttempts: maxAttempts,
		wake:        make(chan struct{}, 1),
		stop:        make(chan struct{}),
	}
	if err := st.EnsureAIQueueSchema(); err != nil {
		panic(fmt.Sprintf("init ai queue schema: %v", err))
	}
	_ = st.RequeueRunningAIJobs()
	for i := 0; i < concurrency; i++ {
		q.wg.Add(1)
		go q.worker()
	}
	q.notify()
	return q
}

func (q *Queue) Concurrency() int { return q.concurrency }

func (q *Queue) Close() {
	q.closeOnce.Do(func() { close(q.stop) })
	q.wg.Wait()
}

// Enqueue persists a model request and returns immediately. Unchanged revisions reuse existing work.
func (q *Queue) Enqueue(req domain.RunAIRequest) (*domain.AIJob, error) {
	if q == nil || q.service == nil {
		return nil, fmt.Errorf("%s: ai queue unavailable", domain.ErrAINotConfigured)
	}
	q.enqueueMu.Lock()
	defer q.enqueueMu.Unlock()
	normalized, err := q.service.NormalizeRequest(req)
	if err != nil {
		return nil, err
	}
	packet, err := q.store.GetPacketByDocumentID(normalized.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrNotFound, err)
	}
	if existing, err := q.store.FindReusableAIJob(packet.DocumentID, packet.RevisionID, normalized.RecipeID, normalized.Model); err != nil {
		return nil, err
	} else if existing != nil {
		return existing, nil
	}

	now := time.Now().UTC()
	job := &domain.AIJob{
		ID:          "aijob_" + uuid.NewString(),
		DocumentID:  packet.DocumentID,
		RevisionID:  packet.RevisionID,
		RecipeID:    normalized.RecipeID,
		Model:       normalized.Model,
		Status:      domain.AIJobQueued,
		Priority:    0,
		Attempts:    0,
		MaxAttempts: q.maxAttempts,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := q.store.SaveAIJob(job); err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrStoreFailed, err)
	}
	q.notify()
	return job, nil
}

func (q *Queue) Get(id string) (*domain.AIJob, error) {
	return q.store.GetAIJob(id)
}

func (q *Queue) List(limit int, status domain.AIJobStatus) ([]domain.AIJob, error) {
	return q.store.ListAIJobs(limit, status)
}

func (q *Queue) Stats() (domain.AIQueueStats, error) {
	counts, err := q.store.AIQueueCounts()
	if err != nil {
		return domain.AIQueueStats{}, err
	}
	return domain.AIQueueStats{
		Concurrency: q.concurrency,
		Queued:      counts[domain.AIJobQueued],
		Running:     counts[domain.AIJobRunning],
		RetryWait:   counts[domain.AIJobRetryWait],
		Done:        counts[domain.AIJobDone],
		Failed:      counts[domain.AIJobFailed],
	}, nil
}

func (q *Queue) notify() {
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *Queue) worker() {
	defer q.wg.Done()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		for {
			job, err := q.store.ClaimNextAIJob()
			if err != nil || job == nil {
				break
			}
			q.execute(job)
		}
		select {
		case <-q.stop:
			return
		case <-q.wake:
		case <-ticker.C:
		}
	}
}

func (q *Queue) execute(job *domain.AIJob) {
	resp, err := q.service.RunRevision(context.Background(), domain.RunAIRequest{
		DocumentID: job.DocumentID,
		RecipeID:   job.RecipeID,
		Model:      job.Model,
	}, job.RevisionID)
	if err == nil {
		_ = q.store.FinishAIJob(job.ID, resp.ID)
		return
	}
	if job.Attempts < job.MaxAttempts {
		delay := retryDelay(job.Attempts)
		_ = q.store.RetryAIJob(job.ID, err.Error(), time.Now().UTC().Add(delay))
		q.notify()
		return
	}
	_ = q.store.FailAIJob(job.ID, err.Error())
}

func retryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	d := time.Second << min(attempt-1, 5)
	if d > 30*time.Second {
		return 30 * time.Second
	}
	return d
}
