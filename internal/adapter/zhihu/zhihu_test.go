package zhihu

import (
	"testing"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

func TestCanHandle(t *testing.T) {
	a := New()
	if !a.CanHandle(domain.CaptureTarget{URL: "https://www.zhihu.com/question/1/answer/2"}) {
		t.Fatal("expected handle answer url")
	}
	if a.CanHandle(domain.CaptureTarget{URL: "https://example.com"}) {
		t.Fatal("should not handle non-zhihu")
	}
}

func TestPlanAnswer(t *testing.T) {
	a := New()
	url := "https://www.zhihu.com/question/1957061060604437527/answer/2003167016782157523"
	plan, err := a.Plan(domain.CaptureTarget{URL: url})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Collector != domain.CollectorOpenCLI {
		t.Fatalf("collector=%s", plan.Collector)
	}
	if plan.Params["kind"] != "answer" {
		t.Fatalf("kind=%s", plan.Params["kind"])
	}
	joined := join(plan.Args)
	if !contains(plan.Args, "answer-detail") || !contains(plan.Args, "-f") {
		t.Fatalf("args=%v", plan.Args)
	}
	if !contains(plan.Args, "json") {
		t.Fatalf("missing json format: %s", joined)
	}
}

func TestPlanQuestionRejected(t *testing.T) {
	a := New()
	_, err := a.Plan(domain.CaptureTarget{URL: "https://www.zhihu.com/question/1957061060604437527"})
	if err == nil {
		t.Fatal("expected error for bare question url")
	}
}

func TestNormalizeAnswer(t *testing.T) {
	a := New()
	plan, err := a.Plan(domain.CaptureTarget{
		URL: "https://www.zhihu.com/question/1/answer/2",
	})
	if err != nil {
		t.Fatal(err)
	}
	stdout := `[
  {
    "id": "2",
    "author": "测试作者",
    "votes": 10,
    "comments": 1,
    "question_id": "1",
    "question_title": "测试问题",
    "url": "https://www.zhihu.com/question/1/answer/2",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-02T00:00:00.000Z",
    "content": "这是回答正文。"
  }
]`
	packet, err := a.Normalize(domain.RawResult{Stdout: stdout, ExitCode: 0}, plan)
	if err != nil {
		t.Fatal(err)
	}
	if packet.SchemaVersion != domain.ContentPacketSchemaVersion {
		t.Fatalf("schema=%s", packet.SchemaVersion)
	}
	if packet.Source != "zhihu" || packet.Type != "answer" {
		t.Fatalf("source/type=%s/%s", packet.Source, packet.Type)
	}
	if packet.Author != "测试作者" {
		t.Fatalf("author=%s", packet.Author)
	}
	if packet.Title != "测试问题" {
		t.Fatalf("title=%s", packet.Title)
	}
	if packet.Collector != domain.CollectorOpenCLI {
		t.Fatalf("collector=%s", packet.Collector)
	}
	if packet.ContentMD == "" || packet.ContentHash == "" {
		t.Fatal("missing content")
	}
}

func join(args []string) string {
	return stringJoin(args, " ")
}

func stringJoin(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for i := 1; i < len(parts); i++ {
		out += sep + parts[i]
	}
	return out
}

func contains(args []string, want string) bool {
	for _, a := range args {
		if a == want {
			return true
		}
	}
	return false
}
