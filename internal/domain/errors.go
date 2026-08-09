package domain

// ErrorCode classifies pipeline failures for clients and retry policy.
type ErrorCode string

const (
	ErrOK              ErrorCode = "ok"
	ErrInvalidTarget   ErrorCode = "invalid_target"
	ErrAdapterNotFound ErrorCode = "adapter_not_found"
	ErrPlanFailed      ErrorCode = "plan_failed"
	ErrRunnerFailed    ErrorCode = "runner_failed"
	ErrRunnerTimeout   ErrorCode = "runner_timeout"
	ErrNormalizeFailed ErrorCode = "normalize_failed"
	ErrStoreFailed     ErrorCode = "store_failed"
	ErrInternal        ErrorCode = "internal"
)

// Recoverable reports whether a retry or collector switch may help.
func (c ErrorCode) Recoverable() bool {
	switch c {
	case ErrPlanFailed, ErrRunnerFailed, ErrRunnerTimeout, ErrStoreFailed:
		return true
	default:
		return false
	}
}
