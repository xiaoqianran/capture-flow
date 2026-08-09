package runner

import (
	"context"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// Runner executes a CapturePlan and returns raw output.
// It must not interpret site semantics.
type Runner interface {
	Name() string
	Run(ctx context.Context, plan domain.CapturePlan) (domain.RawResult, error)
}
