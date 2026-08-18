# Capture Flow Architecture v0.2

Capture Flow 是一个 **Browser-first 的本地实时内容采集与 AI 后台处理 Hub**。

## 1. 核心数据流

```text
Browser / Userscript / MV3
        │
        │ extract current rendered DOM
        ▼
  BrowserSnapshot
        │ POST /captures
        ▼
     Go Local Hub
        │
        ├── ContentPacket + Revision ──> SQLite + packet JSON
        │
        └── AIJob (optional) ──> durable ai_jobs queue
                                  │
                                  ├── worker 1
                                  ├── worker 2
                                  ├── ...
                                  └── worker N (default 5)
                                        │
                                        ▼
                              OpenAI-compatible API
                                        │
                                        ▼
                                   AIResponse
```

Browser 只负责 **采集当前真实页面并入队**，不负责等待模型完成。Tab 关闭后，已经持久化的 AI Job 继续执行。

## 2. Collector 边界

### Primary: `browser-dom`

浏览器从当前渲染完成的 DOM 提取：

- URL / canonical URL
- title / author
- 正文文本
- 清理后的 HTML
- source / captured_at

适合登录态、SPA、展开后的内容、动态渲染页面。

### Fallback: `opencli`

`POST /jobs` 仍保留 URL-only 流程：

```text
URL -> capture queue -> Adapter -> OpenCLI Runner -> Normalize -> ContentPacket
```

该路径由固定数量 capture workers 消费，默认并发 2，不再为每个请求直接创建无限 goroutine。

## 3. 两个独立队列

### Capture Queue

用途：OpenCLI fallback。

状态沿用：

```text
queued -> planning -> running -> normalizing -> stored -> done
                                             \-> failed
```

Hub 启动时把中断的非终态任务重新放回 `queued`。

配置：

```text
CAPTURE_FLOW_CAPTURE_CONCURRENCY=2
# 或 -capture-concurrency 2
```

### AI Queue

用途：所有模型调用。

```text
queued -> running -> done
          │
          └-> retry_wait -> running
                         \-> failed
```

`ai_jobs` 持久化到 SQLite。默认：

```text
CAPTURE_FLOW_AI_CONCURRENCY=5
CAPTURE_FLOW_AI_MAX_ATTEMPTS=3
```

每个 AI Job 在入队时绑定：

```text
document_id + revision_id + recipe_id + model
```

因此排队期间网页产生新 revision，也不会让旧 Job 错误处理新内容。

同一 revision + recipe + model 已存在 `queued/running/retry_wait/done` Job 时直接复用，避免重复请求。

## 4. API

### Browser ingest

`POST /captures`

```json
{
  "url": "https://example.com/post",
  "title": "...",
  "author": "...",
  "content_md": "...",
  "content_raw": "<article>...</article>",
  "source": "example.com",
  "type": "page",
  "captured_at": "2026-08-18T10:00:00Z",
  "auto_ai": true,
  "recipe_id": "summarize"
}
```

返回 `202 Accepted`。若 `auto_ai=true`，响应中附带 `ai_job`；AI 不可用时正文仍会保存，并通过 `ai_error` 返回入队失败原因。

### Capture fallback

- `POST /jobs`
- `GET /jobs`
- `GET /jobs/{id}`

### AI queue

- `POST /ai/jobs`：入队
- `GET /ai/jobs`：列表
- `GET /ai/jobs/{id}`：状态
- `GET /ai/queue`：running/queued/retry/done/failed 统计
- `POST /ai/run`：仅保留同步兼容/调试路径

### Documents

- `GET /docs`
- `GET /docs/{id}`
- `GET /docs/{id}/ai`

## 5. Persistence

```text
data/
├── hub.db
├── packets/
│   └── <revision_id>.json
└── ai_responses/
```

SQLite 保存：

- jobs
- documents
- ai_responses
- ai_jobs

Packet revision 是不可变文件；`documents` 只指向最新 revision。

## 6. Browser clients

### Userscript（权威入口）

`userscript/`：

- DOM Snapshot
- SPA 导航检测
- 可选“新页面自动采集”
- 可选“自动加入 AI 队列”
- 队列状态显示
- `Alt+Shift+C` 手动采集
- `Alt+Shift+P` 开关面板

### Chrome MV3

`extension/` 通过 `chrome.scripting.executeScript` 采当前标签页 DOM，然后调用 `/captures`。它不承担队列调度。

### Web UI

Local Hub UI 用于：

- Library
- URL/OpenCLI fallback Capture
- Capture Job 状态
- AI enqueue
- AI queue 统计
- AI responses

Web UI 本身不能读取其他网站 DOM，因此实时页面采集仍由 Userscript/MV3 完成。

## 7. 责任边界

```text
Browser       = 看见什么，就采什么
Hub           = 去重、版本、持久化、调度
CaptureWorker = URL fallback
AIWorker      = 固定并发模型调用
LLM Provider  = 推理
```

最重要的约束：**并发控制只能在 Hub；不能由每个 Tab 自己决定。**
