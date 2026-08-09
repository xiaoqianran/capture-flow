package cli

import (
	"context"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

func TestRunEcho(t *testing.T) {
	// Use a platform shell that prints known stdout.
	var bin string
	var args []string
	if runtime.GOOS == "windows" {
		bin = "cmd"
		args = []string{"/C", "echo", `{"ok":true}`}
	} else {
		bin = "echo"
		args = []string{`{"ok":true}`}
	}

	r := New(bin)
	// Force plan binary so Lookup uses cmd/echo.
	plan := domain.CapturePlan{
		Binary: bin,
		Args:   args,
	}
	// Lookup must resolve; for cmd/echo use LookPath via default.
	res, err := r.Run(context.Background(), plan)
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if res.ExitCode != 0 {
		t.Fatalf("exit=%d stderr=%s", res.ExitCode, res.Stderr)
	}
	if res.Stdout == "" {
		t.Fatal("empty stdout")
	}
	_ = filepath.Separator
}
