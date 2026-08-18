# Capture Flow · Local Hub Web UI

React + Vite + TypeScript 的本地工作台。当前 UI 以 **Catppuccin Mocha** 为默认主题，并支持持久化切换到 **Latte**。

## 设计目标

Web 不再只是调试面板，而是围绕日常使用的三条主路径组织：

- **资料库**：搜索 → 阅读正文 → 查看 AI 结果 / 元数据 → 继续加入 AI 队列。
- **活动**：统一观察 Capture Queue 与 AI Queue，看到并发、排队、重试、失败和执行轨迹。
- **采集**：手动 URL fallback 入队即返回；日常浏览优先使用 Browser Snapshot。

交互原则：

- 后台任务不阻塞页面，不要求用户等待轮询结束。
- Capture 与 AI 使用独立的局部 loading 状态，不用全局 busy 锁住整页。
- 成功 / 错误通过 toast 就地反馈；Hub 离线提供可复制的启动命令。
- `/` 可随时聚焦资料库搜索。
- Mocha / Latte 主题保存到 `localStorage`，首屏脚本避免主题闪烁。
- 响应式布局覆盖桌面、平板和窄屏，并尊重 `prefers-reduced-motion`。

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
