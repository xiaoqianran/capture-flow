package ai

import (
	"strings"
	"testing"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

func TestBuildUserPrompt(t *testing.T) {
	out := BuildUserPrompt("T={{title}} C={{content_md}}", domain.ContentPacket{
		Title:     "Hello",
		ContentMD: "Body",
	})
	if out != "T=Hello C=Body" {
		t.Fatalf("got %q", out)
	}
}

func TestBuiltinRecipes(t *testing.T) {
	list := ListRecipes()
	if len(list) < 2 {
		t.Fatal("expected builtin recipes")
	}
	for _, r := range list {
		if r.ID == "" || r.UserTemplate == "" || r.SystemPrompt == "" {
			t.Fatalf("incomplete recipe: %+v", r)
		}
		if !strings.Contains(r.UserTemplate, "{{content_md}}") {
			t.Fatalf("recipe %s missing content_md", r.ID)
		}
	}
}
