# Capture Flow · Userscript（SubBatch 架构）

按 **loop-bilibili-subbatch** 的工程思路重建的 Tampermonkey 正式产物：

```text
apps/userscript          composition root + Host Adapter
packages/runtime         Ports：storage / network / clipboard / style / shortcuts / page / hub
packages/hub-client      类型化 Local Hub API（与 Go Hub 对齐）
packages/ui              Studio Dock 面板
packages/core            纯函数：快捷键、路由、DOM Snapshot、GM storage key
scripts/build-userscript.ts
  → dist/userscript/capture-flow.user.js
```

**原则（对齐 SubBatch 任务书）**

1. **Runtime Port 与 Host 分离**：页面能力经 `UserscriptHost` 注入，不在 UI 里直接调 GM。
2. **Hub Client 独立**：当前 DOM → `POST /captures`；Hub 返回后浏览器不等待模型。
3. **纯函数进 core**：快捷键保护、路由识别、失败文案可单测。
4. **IIFE 单文件发布**：metadata 头 + monorepo bundle，无运行时 ESM。
5. **SPA 导航**：pushState / replaceState / popstate / hashchange / poll。

## 构建

```bash
cd userscript
bun install
bun run build
# → dist/userscript/capture-flow.user.js
```

```bash
bun run test
bun run typecheck
```

## 安装

1. 启动 Hub：`go run ./cmd/hub -addr 127.0.0.1:8080 -data data`
2. Tampermonkey → 创建新脚本 → 粘贴 / 安装 `dist/userscript/capture-flow.user.js`
3. 打开任意 http(s) 页面，右下角 **Capture Flow** 浮钮；可开启“新页面自动采集”与“自动加入 AI 队列”

| 快捷键 | 动作 |
|--------|------|
| `Alt+Shift+C` | 捕获当前页到 Hub |
| `Alt+Shift+P` | 开/关面板 |

## 与旧 Chrome Extension

`extension/` 仍是早期 MV3 壳。**正式浏览器集成以本 userscript monorepo 为准**；扩展可后续改为同一套 packages 的双端构建目标。

## v0.2 数据流

```text
Live DOM → Snapshot → POST /captures → Content Store
                                   └→ AIJob queued → Hub workers (default 5) → AIResponse
```

页面关闭不会取消已入队的 AI Job。SPA 导航开启自动采集后也会在 DOM 稳定后生成 Snapshot。
