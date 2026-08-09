package adapter

import "github.com/xiaoqianran/capture-flow/internal/domain"

// Adapter binds site semantics: can_handle, plan, normalize.
// It must not start processes (Runner owns execution).
type Adapter interface {
	Name() string
	Version() string
	CanHandle(target domain.CaptureTarget) bool
	Plan(target domain.CaptureTarget) (domain.CapturePlan, error)
	Normalize(raw domain.RawResult, plan domain.CapturePlan) (domain.ContentPacket, error)
}
