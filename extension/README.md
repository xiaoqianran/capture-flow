# Capture Flow · Chrome Extension

把**当前标签页 URL** 提交到本机 Hub：`POST /jobs` → 轮询状态 → 可选跑 AI。

## 安装（开发者模式）

1. 启动 Hub：

   ```bash
   go run ./cmd/hub -addr 127.0.0.1:8080 -data data
   # 或假跑：go run ./cmd/hub -fake-runner -fake-ai
   ```

2. Chrome 打开 `chrome://extensions`
3. 打开 **开发者模式**
4. **加载已解压的扩展程序** → 选择本目录 `extension/`
5. 固定扩展图标；可选在扩展 **选项** 里改 Hub URL

## 使用

| 操作 | 说明 |
|------|------|
| 点击扩展图标 → **捕获到 Hub** | 提交当前 `http(s)` 页 |
| 勾选「捕获后跑 AI」 | 成功入库后 `POST /ai/run` |
| 快捷键 `Ctrl+Shift+Y` | 后台捕获（Mac: `⌘⇧Y`） |

## 权限说明

- `activeTab` / `tabs`：读取当前页 URL（不注入采集逻辑；采集在 Hub + OpenCLI）
- `storage`：保存 Hub 地址与偏好
- `host_permissions`：仅 `localhost` / `127.0.0.1`，调用本机 API

## 文件

```text
manifest.json
popup.html / popup.js / popup.css
options.html / options.js
background.js
lib/hub.js          # REST 客户端
```

无构建步骤；ES modules 原生加载。
