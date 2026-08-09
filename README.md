# Capture Flow

本地优先的 **Personal AI Hub**：用 **OpenCLI** 采集内容 → 规范 `ContentPacket` → SQLite 版本库 → AI 配方（OpenAI 兼容）。

> v1 约束：Hub = **Go**；UI/扩展 = **Bun + TypeScript**；Collector = **仅 OpenCLI**；站点顺序 **知乎 → 通用网页 → B站/YouTube**。

## 现状

| 能力 | 状态 |
|------|------|
| 知乎回答 | `zhihu` + `opencli zhihu answer-detail` |
| 通用网页 | `generic-web` + `opencli web read --stdout` |
| 假数据 | `fake://…`（或 `-fake-runner`） |
| 去重 | 同 `document_id` + 同 `content_hash` 不写新 revision |
| AI | OpenAI 兼容 `/chat/completions`；内置 summarize/outline/qa-prep |
| 客户端 | `go run ./cmd/capture <url>` / `capture ai <doc>` |
| Chrome 扩展 | `extension/` 当前页一键入队（可选 AI） |
| Local Hub UI | `web/` Library / Jobs / Capture（Vite） |

```text
Registry: zhihu → generic-web → fake
Collector: opencli only
```

依赖：Go 1.22+；真实采集需本机 `opencli`（`opencli doctor`）。

## 快速运行

```bash
go test ./...
go run ./cmd/hub -addr 127.0.0.1:8080 -data data

# 全假跑（不依赖 opencli / 模型 API）
go run ./cmd/hub -fake-runner -fake-ai

# 真实 AI（OpenAI 兼容）
# set CAPTURE_FLOW_AI_API_KEY=sk-...
# set CAPTURE_FLOW_AI_BASE_URL=https://api.openai.com/v1
# set CAPTURE_FLOW_AI_MODEL=gpt-4o-mini
go run ./cmd/hub
```

另开终端：

```bash
go run ./cmd/capture "https://www.zhihu.com/question/<qid>/answer/<aid>"
go run ./cmd/capture "https://example.com"
go run ./cmd/capture fake://demo

go run ./cmd/capture recipes
go run ./cmd/capture ai <document_id> -recipe summarize
go run ./cmd/capture ai-list <document_id>
go run ./cmd/capture ai-show <response_id>

curl -s -X POST http://127.0.0.1:8080/ai/run \
  -H "Content-Type: application/json" \
  -d "{\"document_id\":\"doc_xxx\",\"recipe_id\":\"summarize\"}"
```

**说明**：知乎仅问题页（无 `/answer/<id>`）会被拒绝。重复捕获且内容未变时 Job trace 含 `dedup:same_hash`。AI 结果写入 `data/ai_responses/*.md`。

## Chrome 扩展

```bash
# 1) 启动 Hub
go run ./cmd/hub -addr 127.0.0.1:8080 -data data

# 2) Chrome → chrome://extensions → 开发者模式
#    → 加载已解压的扩展程序 → 选择仓库下 extension/ 目录
```

详见 [extension/README.md](./extension/README.md)。快捷键默认 `Ctrl+Shift+Y`。

## Local Hub Web UI

**单进程（推荐）**：

```bash
cd web && bun install && bun run build
go run ./cmd/hub -addr 127.0.0.1:8080 -data data
# 打开 http://127.0.0.1:8080/  （Hub 托管 web/dist）
```

**热更新开发**：

```bash
go run ./cmd/hub -addr 127.0.0.1:8080 -data data
cd web && bun run dev   # http://127.0.0.1:5173 ，/api → :8080
```

`-web-dir` 默认 `web/dist`；`-web-dir=-` 关闭 UI。详见 [web/README.md](./web/README.md)。

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — v1 架构基线
- [TASKS.md](./TASKS.md) — 里程碑与任务
- [schemas/](./schemas/) — ContentPacket / Job 契约

## 目录（Hub）

```text
cmd/hub/           守护进程
cmd/capture/       本地 CLI 客户端
extension/         Chrome MV3 扩展（当前页捕获）
web/               Local Hub UI（React + Vite）
internal/
  adapter/         zhihu · generic-web · fake
  runner/          cli (opencli) · fake
  orchestrator/    Job 状态机 + 去重
  ai/              Recipe · Prompt · Dispatcher · Service
  store/           SQLite + packet / ai_responses 文件
  api/             REST
  domain/          类型 / 状态 / 错误码
schemas/           JSON Schema
```
