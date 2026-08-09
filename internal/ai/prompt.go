package ai

import (
	"strings"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

// BuildUserPrompt replaces {{field}} placeholders from the packet.
func BuildUserPrompt(tmpl string, packet domain.ContentPacket) string {
	replacer := strings.NewReplacer(
		"{{title}}", packet.Title,
		"{{author}}", packet.Author,
		"{{url}}", packet.URL,
		"{{content_md}}", packet.ContentMD,
		"{{source}}", packet.Source,
		"{{type}}", packet.Type,
		"{{document_id}}", packet.DocumentID,
		"{{revision_id}}", packet.RevisionID,
	)
	return replacer.Replace(tmpl)
}
