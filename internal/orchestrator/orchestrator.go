package orchestrator

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xiaoqianran/capture-flow/internal/adapter"
	"github.com/xiaoqianran/capture-flow/internal/domain"
	"github.com/xiaoqianran/capture-flow/internal/runner"
	"github.com/xiaoqianran/capture-flow/internal/store"
)

// Orchestrator runs Job → Adapter → Runner → Packet → Store.
type Orchestrator struct {
	store    *store.Store
	adapters []adapter.Adapter
	runner   runner.Runner
}

func New(st *store.Store, adapters []adapter.Adapter, r runner.Runner) *Orchestrator {
	return &Orchestrator{store: st, adapters: adapters, runner: r}
}

func (o *Orchestrator) Submit(ctx context.Context, target domain.CaptureTarget) (*domain.Job, error) {
	if target.URL == "" {
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

	// M1: process async so POST returns quickly; clients poll GET /jobs/:id.
	go o.process(context.Background(), job.ID)
	return job, nil
}

func (o *Orchestrator) GetJob(id string) (*domain.Job, error) {
	return o.store.GetJob(id)
}

func (o *Orchestrator) GetDocument(documentID string) (*domain.ContentPacket, error) {
	return o.store.GetPacketByDocumentID(documentID)
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

	// planning
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

	// running
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

	// normalizing
	job.Status = domain.JobNormalizing
	job.Trace = append(job.Trace, "normalizing")
	job.UpdatedAt = time.Now().UTC()
	_ = o.store.SaveJob(job)

	packet, err := ad.Normalize(raw, plan)
	if err != nil {
		fail(domain.ErrNormalizeFailed, err.Error())
		return
	}

	// stored (or dedup if same content_hash)
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
