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

API 前缀默认 `/api`（见 `vite.config.ts` proxy → `:8080`）。
