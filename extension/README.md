# Capture Flow · Chrome Extension（过渡壳）

> **正式浏览器脚本请使用 Userscript monorepo**（SubBatch 同款架构）：  
> [`../userscript/`](../userscript/) → 构建产物 `userscript/dist/userscript/capture-flow.user.js`

本目录是早期 MV3 popup 壳，能力已由油猴 **Studio Dock** 覆盖（Hub 入队、轮询、AI、SPA、快捷键、GM 存储）。

后续可将 extension 改为与 userscript 共享 `@capture-flow/*` packages 的双端构建；当前以 **Tampermonkey 产物为权威前端集成**。

## 若仍要用扩展

1. 启动 Hub  
2. `chrome://extensions` 加载本目录  
3. 设置里填 `http://127.0.0.1:8080`
