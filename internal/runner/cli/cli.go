package cli

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// Runner executes CapturePlan via an external CLI (v1: opencli only).
type Runner struct {
	// Binary defaults to "opencli" when plan.Binary is empty.
	Binary string
	// Lookup resolves the executable path; defaults to exec.LookPath.
	Lookup func(file string) (string, error)
}

func New(binary string) *Runner {
	if binary == "" {
		binary = "opencli"
	}
	return &Runner{
		Binary: binary,
		Lookup: exec.LookPath,
	}
}

func (r *Runner) Name() string {
	return "cli-opencli"
}

func (r *Runner) Run(ctx context.Context, plan domain.CapturePlan) (domain.RawResult, error) {
	if err := ctx.Err(); err != nil {
		return domain.RawResult{}, err
	}
	if len(plan.Args) == 0 {
		return domain.RawResult{}, fmt.Errorf("capture plan has empty args")
	}

	bin := plan.Binary
	if bin == "" {
		bin = r.Binary
	}
	if bin == "" {
		bin = "opencli"
	}

	path, err := r.Lookup(bin)
	if err != nil {
		// On Windows, opencli.cmd may still run via shell if bare name works.
		path = bin
	}

	cmd := exec.CommandContext(ctx, path, plan.Args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	elapsed := time.Since(start)

	exitCode := 0
	if runErr != nil {
		if ee, ok := runErr.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else if ctx.Err() != nil {
			return domain.RawResult{
				Stdout:   stdout.String(),
				Stderr:   stderr.String(),
				ExitCode: -1,
				Meta: map[string]string{
					"binary":      bin,
					"args":        strings.Join(plan.Args, " "),
					"elapsed_ms":  fmt.Sprintf("%d", elapsed.Milliseconds()),
					"error":       runErr.Error(),
					"ctx_error":   ctx.Err().Error(),
				},
			}, fmt.Errorf("runner cancelled/timeout: %w", runErr)
		} else {
			return domain.RawResult{
				Stdout:   stdout.String(),
				Stderr:   stderr.String(),
				ExitCode: -1,
				Meta: map[string]string{
					"binary": bin,
					"args":   strings.Join(plan.Args, " "),
					"error":  runErr.Error(),
				},
			}, fmt.Errorf("start opencli failed: %w", runErr)
		}
	}

	result := domain.RawResult{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
		Meta: map[string]string{
			"binary":     bin,
			"args":       strings.Join(plan.Args, " "),
			"elapsed_ms": fmt.Sprintf("%d", elapsed.Milliseconds()),
			"collector":  domain.CollectorOpenCLI,
		},
	}
	if exitCode != 0 {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		return result, fmt.Errorf("opencli exit=%d: %s", exitCode, truncate(msg, 500))
	}
	return result, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
