package orchestrator

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/xiaoqianran/capture-flow/internal/adapter"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/runner"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

const defaultCaptureConcurrency = 2

// Orchestrator owns the durable capture queue and the browser-snapshot ingest path.
type Orchestrator struct {
	store       *store.Store
	adapters    []adapter.Adapter
	runner      runner.Runner
	concurrency int
	wake        chan struct{}
	stop        chan struct{}
	wg          sync.WaitGroup
	closeOnce   sync.Once
}

func New(st *store.Store, adapters []adapter.Adapter, r runner.Runner) *Orchestrator {
	return NewWithConcurrency(st, adapters, r, defaultCaptureConcurrency)
}

func NewWithConcurrency(st *store.Store, adapters []adapter.Adapter, r runner.Runner, concurrency int) *Orchestrator {
	if concurrency <= 0 {
		concurrency = 1
	}
	o := &Orchestrator{
		store:       st,
		adapters:    adapters,
		runner:      r,
		concurrency: concurrency,
		wake:        make(chan struct{}, 1),
		stop:        make(chan struct{}),
	}
	_ = st.RequeueIncompleteCaptureJobs()
	for i := 0; i < concurrency; i++ {
		o.wg.Add(1)
		go o.worker()
	}
	o.notify()
	return o
}

func (o *Orchestrator) Concurrency() int { return o.concurrency }

func (o *Orchestrator) Close() {
	o.closeOnce.Do(func() { close(o.stop) })
	o.wg.Wait()
}

// Submit persists a URL-based fallback capture. Workers, not request goroutines, execute OpenCLI.
func (o *Orchestrator) Submit(ctx context.Context, target domain.CaptureTarget) (*domain.Job, error) {
	if strings.TrimSpace(target.URL) == "" {
		return nil, fmt.Errorf("%s: url is required", domain.ErrInvalidTarget)
	}
	if target.Task == "" {
		target.Task = "full_text"
	}

	now := time.Now().UTC()
	job := &domain.Job{
		ID:        "job_" + uuid.NewString(),
		Status:    domain.JobQueued,
		Target:    target,
		Trace:     []string{"queued"},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := o.store.SaveJob(job); err != nil {
		return nil, err
	}
	o.notify()
	return job, nil
}

// CaptureSnapshot persists content already extracted from the live browser DOM.
func (o *Orchestrator) CaptureSnapshot(req domain.BrowserCaptureRequest) (*domain.CaptureReceipt, error) {
	rawURL := strings.TrimSpace(req.URL)
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, fmt.Errorf("%s: browser capture requires http(s) url", domain.ErrInvalidTarget)
	}
	content := strings.TrimSpace(req.ContentMD)
	if content == "" {
		return nil, fmt.Errorf("%s: content_md is required", domain.ErrInvalidTarget)
	}

	docType := strings.TrimSpace(req.Type)
	if docType == "" {
		docType = "page"
	}
	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = strings.ToLower(parsed.Hostname())
	}
	if source == "" {
		source = "browser"
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = rawURL
	}
	capturedAt := strings.TrimSpace(req.CapturedAt)
	if capturedAt == "" {
		capturedAt = time.Now().UTC().Format(time.RFC3339)
	}
	contentRaw := req.ContentRaw
	if strings.TrimSpace(contentRaw) == "" {
		contentRaw = content
	}

	packet := domain.ContentPacket{
		SchemaVersion:  domain.ContentPacketSchemaVersion,
		DocumentID:     domain.DocumentID(rawURL, docType),
		RevisionID:     domain.RevisionID(),
		Source:         source,
		Type:           docType,
		URL:            rawURL,
		Title:          title,
		Author:         strings.TrimSpace(req.Author),
		ContentMD:      content,
		ContentRaw:     contentRaw,
		Collector:      domain.CollectorBrowser,
		Adapter:        "browser-dom",
		AdapterVersion: "1.0.0",
		CapturedAt:     capturedAt,
		ContentHash:    domain.ContentHash(content),
	}
	revisionID, deduped, err := o.store.SavePacketIfChanged(packet)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", domain.ErrStoreFailed, err)
	}
	return &domain.CaptureReceipt{
		DocumentID: packet.DocumentID,
		RevisionID: revisionID,
		Deduped:    deduped,
	}, nil
}

func (o *Orchestrator) GetJob(id string) (*domain.Job, error) {
	return o.store.GetJob(id)
}

func (o *Orchestrator) GetDocument(documentID string) (*domain.ContentPacket, error) {
	return o.store.GetPacketByDocumentID(documentID)
}

func (o *Orchestrator) ListJobs(limit int) ([]domain.Job, error) {
	return o.store.ListJobs(limit)
}

func (o *Orchestrator) ListDocuments(limit int) ([]domain.DocumentSummary, error) {
	return o.store.ListDocuments(limit)
}

func (o *Orchestrator) notify() {
	select {
	case o.wake <- struct{}{}:
	default:
	}
}

func (o *Orchestrator) worker() {
	defer o.wg.Done()
	ticker := time.NewTicker(750 * time.Millisecond)
	defer ticker.Stop()
	for {
		for {
			job, err := o.store.ClaimNextCaptureJob()
			if err != nil || job == nil {
				break
			}
			o.process(context.Background(), job.ID)
		}
		select {
		case <-o.stop:
			return
		case <-o.wake:
		case <-ticker.C:
		}
	}
}

func (o *Orchestrator) process(ctx context.Context, jobID string) {
	job, err := o.store.GetJob(jobID)
	if err != nil {
		return
	}

	fail := func(code domain.ErrorCode, msg string) {
		job.Status = domain.JobFailed
		job.ErrorCode = code
		job.ErrorMessage = msg
		job.Recoverable = code.Recoverable()
		job.Trace = append(job.Trace, fmt.Sprintf("failed:%s", code))
		job.UpdatedAt = time.Now().UTC()
		_ = o.store.SaveJob(job)
	}

	job.Status = domain.JobPlanning
	job.Trace = append(job.Trace, "planning")
	job.UpdatedAt = time.Now().UTC()
	_ = o.store.SaveJob(job)

	ad, err := o.pickAdapter(job.Target)
	if err != nil {
		fail(domain.ErrAdapterNotFound, err.Error())
		return
	}
	job.Adapter = ad.Name()

	plan, err := ad.Plan(job.Target)
	if err != nil {
		fail(domain.ErrPlanFailed, err.Error())
		return
	}
	job.Collector = plan.Collector
	job.Trace = append(job.Trace, fmt.Sprintf("plan:adapter=%s,collector=%s", plan.Adapter, plan.Collector))
	job.UpdatedAt = time.Now().UTC()
	_ = o.store.SaveJob(job)

	job.Status = domain.JobRunning
	job.Trace = append(job.Trace, "running:"+o.runner.Name())
	job.UpdatedAt = time.Now().UTC()
	_ = o.store.SaveJob(job)

	runCtx := ctx
	if plan.TimeoutMS > 0 {
		var cancel context.CancelFunc
		runCtx, cancel = context.WithTimeout(ctx, time.Duration(plan.TimeoutMS)*time.Millisecond)
		defer cancel()
	}
	raw, err := o.runner.Run(runCtx, plan)
	if err != nil {
		code := domain.ErrRunnerFailed
		if runCtx.Err() == context.DeadlineExceeded {
			code = domain.ErrRunnerTimeout
		}
		fail(code, err.Error())
		return
	}

	job.Status = domain.JobNormalizing
	job.Trace = append(job.Trace, "normalizing")
	job.UpdatedAt = time.Now().UTC()
	_ = o.store.SaveJob(job)

	packet, err := ad.Normalize(raw, plan)
	if err != nil {
		fail(domain.ErrNormalizeFailed, err.Error())
		return
	}

	revID, deduped, err := o.store.SavePacketIfChanged(packet)
	if err != nil {
		fail(domain.ErrStoreFailed, err.Error())
		return
	}
	job.DocumentID = packet.DocumentID
	job.RevisionID = revID
	if deduped {
		job.Trace = append(job.Trace, "dedup:same_hash:"+revID)
	} else {
		job.Status = domain.JobStored
		job.Trace = append(job.Trace, "stored:"+packet.DocumentID)
		job.UpdatedAt = time.Now().UTC()
		_ = o.store.SaveJob(job)
	}

	job.Status = domain.JobDone
	job.ErrorCode = domain.ErrOK
	if deduped {
		job.Trace = append(job.Trace, "done:deduped")
	} else {
		job.Trace = append(job.Trace, "done")
	}
	job.UpdatedAt = time.Now().UTC()
	_ = o.store.SaveJob(job)
}

func (o *Orchestrator) pickAdapter(target domain.CaptureTarget) (adapter.Adapter, error) {
	for _, a := range o.adapters {
		if a.CanHandle(target) {
			return a, nil
		}
	}
	return nil, fmt.Errorf("no adapter for url=%s", target.URL)
}
