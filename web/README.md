# Capture Flow · Local Hub Web UI

React + Vite + TypeScript。开发时通过 Vite proxy 访问本机 Hub。

## 运行

```bash
# 终端 1：Hub
go run ./cmd/hub -addr 127.0.0.1:8080 -data data -fake-runner -fake-ai

# 终端 2：Web
cd web
bun install
bun run dev
# → http://127.0.0.1:5173
```

页面分区：

- **Library**：文档列表 + 正文预览 + Run AI
- **Jobs**：Job 状态 / trace
- **Capture**：提交 URL

API 前缀：

- 开发：`/api`（Vite proxy → `:8080`）
- 生产：同域根路径（由 Hub 托管 `web/dist`）

## 单进程托管（推荐）

```bash
cd web && bun install && bun run build
go run ./cmd/hub -addr 127.0.0.1:8080 -data data
# 浏览器打开 http://127.0.0.1:8080/
```

`-web-dir` 默认 `web/dist`；传 `-web-dir=-` 可关闭 UI。
