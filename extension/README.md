# Capture Flow · Chrome Extension（过渡壳）

> **正式浏览器脚本请使用 Userscript monorepo**（SubBatch 同款架构）：  
> [`../userscript/`](../userscript/) → 构建产物 `userscript/dist/userscript/capture-flow.user.js`

本目录保留为 MV3 客户端：通过 `chrome.scripting` 提取当前页真实 DOM，直接 `POST /captures`，可自动创建后台 AI Job。

Tampermonkey 仍是权威前端集成；MV3 与它遵循相同协议：浏览器只负责 Snapshot，队列和并发由 Go Hub 统一管理。

## 若仍要用扩展

1. 启动 Hub  
2. `chrome://extensions` 加载本目录  
3. 设置里填 `http://127.0.0.1:8080`
4. 点击“采集当前 DOM”；勾选“捕获后加入 AI 队列”时请求只负责入队，不等待模型完成
