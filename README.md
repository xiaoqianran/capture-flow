# Capture Flow

**实时浏览器内容采集 → 本地持久化 → 固定并发 AI 后台队列。**

Capture Flow 的 v0.2 主路径已经从“浏览器只传 URL、Hub 再访问一次网页”改成：

```text
当前浏览器 DOM
   ↓ Snapshot
POST /captures
   ↓
Local Hub / ContentPacket
   ↓
AIJob durable queue
   ↓
固定 worker pool（默认 5）
   ↓
OpenAI-compatible LLM
```

页面完成入队后即可关闭；后续 AI 工作由本地 Hub 继续处理。

## 关键能力

| 能力 | 当前实现 |
|---|---|
| 实时采集 | Userscript / MV3 直接提取当前渲染 DOM |
| 页面版本 | `document_id` 稳定，内容变化生成新 `revision_id` |
| 去重 | 相同 `content_hash` 不产生新 revision |
| URL fallback | OpenCLI + Adapter，固定 capture worker pool |
| AI 队列 | SQLite `ai_jobs` 持久化 |
| AI 并发 | 默认 5，Hub 统一控制 |
| 重试 | `retry_wait` + 最大 attempts |
| 重启恢复 | running AI jobs 回到 queued |
| 防错版本 | AI Job 固定绑定入队时的 revision |
| 前端 | Userscript / Chrome MV3 / Local Hub Web UI |

## 启动 Hub

```bash
go run ./cmd/hub \
  -addr 127.0.0.1:8080 \
  -data data \
  -ai-concurrency 5 \
  -capture-concurrency 2
```

OpenAI-compatible 配置：

```bash
CAPTURE_FLOW_AI_BASE_URL=https://api.openai.com/v1
CAPTURE_FLOW_AI_API_KEY=...
CAPTURE_FLOW_AI_MODEL=gpt-4o-mini
CAPTURE_FLOW_AI_CONCURRENCY=5
CAPTURE_FLOW_AI_MAX_ATTEMPTS=3
```

开发可用：

```bash
go run ./cmd/hub -fake-runner -fake-ai -ai-concurrency 5
```

## Userscript（推荐）

正式源码位于 `userscript/`，可直接安装：

```text
userscript/dist/userscript/capture-flow.user.js
```

打开页面后：

- `Alt+Shift+C`：立即采集当前 DOM
- `Alt+Shift+P`：开关面板
- 可开启“新页面自动采集”
- 可开启“自动加入 AI 队列”

自动采集对 SPA 导航同样生效，导航后约 1.2 秒生成 Snapshot。

## Chrome MV3

`extension/` 可在 `chrome://extensions` 以开发者模式加载。

它使用 `chrome.scripting` 在当前标签页执行正文提取，然后直接调用 `/captures`。快捷键默认 `Ctrl+Shift+Y`。

## API

### 当前 DOM 入库 + 可选 AI 入队

```bash
curl -X POST http://127.0.0.1:8080/captures \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://example.com/a",
    "title":"Example",
    "content_md":"# Example\n\ncontent",
    "auto_ai":true,
    "recipe_id":"summarize"
  }'
```

返回 `202`，可能包含：

```json
{
  "document_id": "doc_...",
  "revision_id": "rev_...",
  "deduped": false,
  "ai_job": {
    "id": "aijob_...",
    "status": "queued"
  }
}
```

### AI queue

```bash
# 单独入队
curl -X POST http://127.0.0.1:8080/ai/jobs \
  -H 'Content-Type: application/json' \
  -d '{"document_id":"doc_...","recipe_id":"summarize"}'

# 队列统计
curl http://127.0.0.1:8080/ai/queue

# Job 状态
curl http://127.0.0.1:8080/ai/jobs/aijob_...
```

`POST /ai/run` 仍保留，但只建议用于同步调试/兼容；正常产品路径使用 `/ai/jobs`。

### URL/OpenCLI fallback

```bash
curl -X POST http://127.0.0.1:8080/jobs \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","task":"full_text"}'
```

## 项目结构

```text
cmd/hub/                     Go Local Hub
cmd/capture/                 CLI
internal/orchestrator/       durable capture worker pool + browser ingest
internal/store/              SQLite / packet persistence / queue storage
internal/ai/                 recipes / dispatcher / durable AI workers
internal/api/                REST API
userscript/                  Tampermonkey 正式入口
extension/                   Chrome MV3
web/                         Local Hub UI
```

详细设计见 [ARCHITECTURE.md](./ARCHITECTURE.md)，后续工作见 [TASKS.md](./TASKS.md)。
