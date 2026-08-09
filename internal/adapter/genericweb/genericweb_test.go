package genericweb

import (
	"testing"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

func TestCanHandle(t *testing.T) {
	a := New()
	if !a.CanHandle(domain.CaptureTarget{URL: "https://example.com/x"}) {
		t.Fatal("https should handle")
	}
	if a.CanHandle(domain.CaptureTarget{URL: "fake://x"}) {
		t.Fatal("fake should not handle")
	}
	if a.CanHandle(domain.CaptureTarget{URL: "ftp://x"}) {
		t.Fatal("ftp should not handle")
	}
}

func TestPlan(t *testing.T) {
	a := New()
	plan, err := a.Plan(domain.CaptureTarget{URL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Collector != domain.CollectorOpenCLI {
		t.Fatalf("collector=%s", plan.Collector)
	}
	foundStdout := false
	for _, arg := range plan.Args {
		if arg == "--stdout" {
			foundStdout = true
		}
	}
	if !foundStdout {
		t.Fatalf("args missing --stdout: %v", plan.Args)
	}
}

func TestNormalizeMarkdown(t *testing.T) {
	a := New()
	plan, _ := a.Plan(domain.CaptureTarget{URL: "https://example.com"})
	stdout := "# Example Domain\n\nHello world\n\n  Update available: v1\n"
	packet, err := a.Normalize(domain.RawResult{Stdout: stdout, ExitCode: 0}, plan)
	if err != nil {
		t.Fatal(err)
	}
	if packet.Title != "Example Domain" {
		t.Fatalf("title=%q", packet.Title)
	}
	if packet.Source != "generic-web" || packet.Type != "page" {
		t.Fatalf("source/type=%s/%s", packet.Source, packet.Type)
	}
	if packet.Collector != domain.CollectorOpenCLI {
		t.Fatalf("collector=%s", packet.Collector)
	}
	if contains(packet.ContentMD, "Update available") {
		t.Fatalf("banner not stripped: %q", packet.ContentMD)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(len(s) > 0 && (func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})()))
}
