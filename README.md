# Capture Flow

本地优先的 **Personal AI Hub**：用 **OpenCLI** 采集内容 → 规范 `ContentPacket` → SQLite 版本库 →（后续）多 AI 配方。

> v1 约束：Hub = **Go**；UI/扩展 = **Bun + TypeScript**；Collector = **仅 OpenCLI**；站点顺序 **知乎 → 通用网页 → B站/YouTube**。

## 现状

| 能力 | 状态 |
|------|------|
| 知乎回答 | `zhihu` + `opencli zhihu answer-detail` |
| 通用网页 | `generic-web` + `opencli web read --stdout` |
| 假数据 | `fake://…`（或 `-fake-runner`） |
| 去重 | 同 `document_id` + 同 `content_hash` 不写新 revision |
| 客户端 | `go run ./cmd/capture <url>` |

```text
Registry: zhihu → generic-web → fake
Collector: opencli only
```

依赖：Go 1.22+；真实采集需本机 `opencli`（`opencli doctor`）。

## 快速运行

```bash
go test ./...
go run ./cmd/hub -addr 127.0.0.1:8080 -data data
# 开发假跑：go run ./cmd/hub -fake-runner
```

另开终端：

```bash
# 推荐：capture 客户端（提交并等待）
go run ./cmd/capture "https://www.zhihu.com/question/<qid>/answer/<aid>"
go run ./cmd/capture "https://example.com"
go run ./cmd/capture job <job_id>
go run ./cmd/capture doc <document_id>

# 或 curl
curl -s -X POST http://127.0.0.1:8080/jobs \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"fake://demo\"}"
```

**说明**：知乎仅问题页（无 `/answer/<id>`）会被拒绝。重复捕获且内容未变时 Job trace 含 `dedup:same_hash`。## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — v1 架构基线
- [TASKS.md](./TASKS.md) — 里程碑与任务
- [schemas/](./schemas/) — ContentPacket / Job 契约

## 目录（Hub）

```text
cmd/hub/           守护进程
cmd/capture/       本地 CLI 客户端
internal/
  adapter/         zhihu · generic-web · fake
  runner/          cli (opencli) · fake
  orchestrator/    Job 状态机 + 去重
  store/           SQLite + packet 文件
  api/             REST
  domain/          类型 / 状态 / 错误码
schemas/           JSON Schema
```
