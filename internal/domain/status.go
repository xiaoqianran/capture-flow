package domain

// JobStatus is the job lifecycle state machine.
type JobStatus string

const (
	JobQueued       JobStatus = "queued"
	JobPlanning     JobStatus = "planning"
	JobRunning      JobStatus = "running"
	JobNormalizing  JobStatus = "normalizing"
	JobStored       JobStatus = "stored"
	JobDone         JobStatus = "done"
	JobFailed       JobStatus = "failed"
	JobCancelled    JobStatus = "cancelled"
)

// IsTerminal reports whether no further transitions are expected.
func (s JobStatus) IsTerminal() bool {
	switch s {
	case JobDone, JobFailed, JobCancelled:
		return true
	default:
		return false
	}
}
