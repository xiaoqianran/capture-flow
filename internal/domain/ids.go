package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// DocumentID derives a stable id from URL + document type.
func DocumentID(url, docType string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(url) + "|" + docType))
	return "doc_" + hex.EncodeToString(sum[:8])
}

// RevisionID creates a unique revision identifier.
func RevisionID() string {
	return fmt.Sprintf("rev_%d", time.Now().UTC().UnixNano())
}

// ContentHash returns sha256:hex of content.
func ContentHash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return "sha256:" + hex.EncodeToString(sum[:])
}
