# Capture Flow Tasks

## v0.2 已完成

- [x] Browser DOM 成为第一采集源
- [x] `POST /captures` 直接接收实时页面 Snapshot
- [x] Userscript 提取当前 DOM，不再只提交 URL
- [x] Userscript 支持 SPA 导航后自动采集
- [x] MV3 使用 `chrome.scripting` 提取当前页 DOM
- [x] OpenCLI 保留为 URL-only fallback
- [x] Capture fallback 改为固定 worker pool
- [x] 新增持久化 `ai_jobs` 队列
- [x] AI 默认最大并发 5，可配置
- [x] AI Job 绑定 immutable `revision_id`
- [x] 相同 revision + recipe + model 去重/复用
- [x] retry_wait + 最大尝试次数
- [x] Hub 重启后恢复 running AI jobs
- [x] `POST /ai/jobs` / `GET /ai/jobs/{id}` / `GET /ai/queue`
- [x] 浏览器收到 202 后即可结束，不等待模型
- [x] Web UI 的 Run AI 改成 Queue AI
- [x] Health 展示 capture concurrency 与 AI queue stats

## 下一阶段 P0

- [ ] 真正跑完整 `go test ./...` + SQLite runtime tests 的 CI
- [ ] 为 `/captures` 增加 payload 上限与更明确的 413 错误
- [ ] AI provider 增加 per-provider RPM/TPM 限速，不只有 concurrency
- [ ] AI Job 支持 cancel / manual retry
- [ ] AI queue UI 增加完整列表、过滤与失败详情
- [ ] 自动采集增加 URL/domain allowlist / blocklist
- [ ] 对自动采集做 debounce + minimum-content threshold 配置
- [ ] Userscript build 产物由 CI 自动生成并校验 source/bundle 一致

## P1

- [ ] 选中文本 Snapshot
- [ ] Readability / site-specific extractor 插件层
- [ ] B站/YouTube transcript Adapter
- [ ] Page revision 时间线
- [ ] Recipe 自定义、版本化
- [ ] SSE/WebSocket 推送队列状态，减少轮询
- [ ] Batch actions：对一组 documents 统一 enqueue recipe

## P2

- [ ] Queue priority
- [ ] Schedule / cron trigger
- [ ] 多 provider 路由与 fallback
- [ ] 成本/token/latency 指标
- [ ] Dead-letter queue
- [ ] Export/backup/import

## 验收场景

### 20 个网页 / AI concurrency = 5

期望：

```text
opened pages: 20
stored snapshots: 20
AI running: <= 5
AI queued: remaining
browser tabs: can close immediately after /captures 202
final: done=20, queued=0, running=0
```

### 同一网页重复采集

正文 hash 相同：

```text
same document_id
same revision_id
capture receipt deduped=true
same recipe/model AI job reused
```

正文变化：

```text
same document_id
new revision_id
new AI job may be created
old queued job still processes its original revision
```
