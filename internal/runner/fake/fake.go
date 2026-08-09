package fake

import (
	"context"
	"fmt"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// Runner simulates OpenCLI output for M1 without spawning processes.
type Runner struct{}

func New() *Runner { return &Runner{} }

func (r *Runner) Name() string { return "fake-opencli" }

func (r *Runner) Run(ctx context.Context, plan domain.CapturePlan) (domain.RawResult, error) {
	if err := ctx.Err(); err != nil {
		return domain.RawResult{}, err
	}

	url := plan.Target.URL
	body := fmt.Sprintf("# Fake capture\n\nSource URL: `%s`\n\nThis packet was produced by FakeRunner for M1 pipeline verification.\n", url)

	return domain.RawResult{
		Stdout:   body,
		Stderr:   "",
		ExitCode: 0,
		Meta: map[string]string{
			"title":     "Fake capture of " + url,
			"author":    "capture-flow-fixture",
			"collector": domain.CollectorOpenCLI,
		},
	}, nil
}
