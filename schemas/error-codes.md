# Error Codes (M0-07)

Cross-language enums. Go: `internal/domain/errors.go`.

## Job Status

| Status | Meaning |
|--------|---------|
| `queued` | Accepted, not planned yet |
| `planning` | Adapter building CapturePlan |
| `running` | Runner executing plan |
| `normalizing` | Adapter.normalize(raw) |
| `stored` | ContentPacket written to store |
| `done` | Terminal success |
| `failed` | Terminal failure |
| `cancelled` | Terminal cancelled by user/system |

## Error Codes

| Code | Recoverable | Meaning |
|------|-------------|---------|
| `ok` | — | No error |
| `invalid_target` | no | URL/task missing or malformed |
| `adapter_not_found` | no | No adapter can_handle target |
| `plan_failed` | yes | Adapter.plan failed |
| `runner_failed` | yes | Collector/process failed |
| `runner_timeout` | yes | Runner exceeded timeout |
| `normalize_failed` | no | Raw cannot map to ContentPacket |
| `store_failed` | yes | SQLite/filesystem write failed |
| `internal` | no | Unexpected hub error |

**Retry policy (v1)**: only when `recoverable=true`. M1 fake path does not auto-retry.
