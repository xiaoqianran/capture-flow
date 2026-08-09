# Capture Flow

本地优先的 **Personal AI Hub**：用 **OpenCLI** 采集内容 → 规范 `ContentPacket` → SQLite 版本库 →（后续）多 AI 配方。

> v1 约束：Hub = **Go**；UI/扩展 = **Bun + TypeScript**；Collector = **仅 OpenCLI**；站点顺序 **知乎 → 通用网页 → B站/YouTube**。

## 现状

- **M1**：假数据链路（`fake://…` + FakeRunner）  
- **M2**：真实知乎回答 → **OpenCLI** → ContentPacket → SQLite  

```text
POST /jobs
  → ZhihuAdapter
  → CLI Runner (opencli zhihu answer-detail … -f json)
  → ContentPacket
  → SQLite
```

依赖：Go 1.22+、本机已安装并可用的 `opencli`（知乎命令需 browser bridge，见 `opencli doctor`）。

## 快速运行

```bash
go test ./...
go run ./cmd/hub -addr 127.0.0.1:8080 -data data
# 仅测假数据：go run ./cmd/hub -fake-runner -addr 127.0.0.1:8080
```

另开终端：

```bash
# 真实知乎回答 URL（需 opencli + 登录态/bridge）
curl -s -X POST http://127.0.0.1:8080/jobs \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://www.zhihu.com/question/<qid>/answer/<aid>\",\"task\":\"full_text\"}"

curl -s http://127.0.0.1:8080/jobs/<job_id>
curl -s http://127.0.0.1:8080/docs/<document_id>

# 假数据（不依赖 opencli）
curl -s -X POST http://127.0.0.1:8080/jobs \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"fake://demo\"}"
```

**说明**：仅问题页 URL（无 `/answer/<id>`）会被拒绝；请传回答链接。专栏文章走 `opencli zhihu download`（元数据优先，正文能力弱于回答）。
## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — v1 架构基线
- [TASKS.md](./TASKS.md) — 里程碑与任务
- [schemas/](./schemas/) — ContentPacket / Job 契约

## 目录（Hub）

```text
cmd/hub/           守护进程入口
internal/
  adapter/         zhihu · fake
  runner/          cli (opencli) · fake
  orchestrator/    Job 状态机
  store/           SQLite + packet 文件
  api/             REST
  domain/          类型 / 状态 / 错误码
schemas/           JSON Schema
```
