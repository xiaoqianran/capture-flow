# Capture Flow

本地优先的 **Personal AI Hub**：用 **OpenCLI** 采集内容 → 规范 `ContentPacket` → SQLite 版本库 →（后续）多 AI 配方。

> v1 约束：Hub = **Go**；UI/扩展 = **Bun + TypeScript**；Collector = **仅 OpenCLI**；站点顺序 **知乎 → 通用网页 → B站/YouTube**。

## M1 现状

已打通假数据链路：

```text
POST /jobs → FakeAdapter → FakeRunner → ContentPacket → SQLite
```

## 快速运行

```bash
# 依赖：Go 1.22+
go test ./...
go run ./cmd/hub -addr 127.0.0.1:8080 -data data
```

另开终端：

```bash
curl -s -X POST http://127.0.0.1:8080/jobs \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://www.zhihu.com/question/1/answer/1\",\"task\":\"full_text\"}"

# 用返回的 job id 轮询
curl -s http://127.0.0.1:8080/jobs/<job_id>

# 完成后用 document_id 取包
curl -s http://127.0.0.1:8080/docs/<document_id>
```

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — v1 架构基线
- [TASKS.md](./TASKS.md) — 里程碑与任务
- [schemas/](./schemas/) — ContentPacket / Job 契约

## 目录（Hub）

```text
cmd/hub/           守护进程入口
internal/
  adapter/         站点语义（含 fake）
  runner/          执行（含 fake-opencli）
  orchestrator/    Job 状态机
  store/           SQLite + packet 文件
  api/             REST
  domain/          类型 / 状态 / 错误码
schemas/           JSON Schema
```
