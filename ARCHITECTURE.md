# Capture Flow — Architecture

> Personal AI Hub：把「任意网页/平台内容」可靠采集为规范文档，再编排多 AI 生成可阅读产物。  
> 原则：**抓取能力外包 · 数据协议自控 · Hub 只做编排、存储与 AI 分发**。

---

## 1. 产品定位

| 维度 | 说明 |
|------|------|
| 是什么 | 本地优先的内容采集 + 文档版本库 + AI 配方工作流 |
| 不是什么 | 通用爬虫框架、浏览器替代品、云端 SaaS 中台 |
| 核心价值 | 同一 URL 可换采集技术；同一 Document 可换 AI 配方；采集语义与执行技术彻底解耦 |
| 典型用户 | 个人知识工作者、内容研究者、需要「存下来再问 AI」的人 |

### 1.1 一句话数据流

```
Trigger → Orchestrator → Adapter Registry → Runner → ContentPacket → Document Revision → Recipe / AI → Viewer
```

---

## 2. 六层架构总览

```
                    ┌─────────────────────────────────────┐
                    │         ① Trigger                   │
                    │  Chrome / CLI / Schedule / API      │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      ② Hub Orchestrator             │
                    │  Job · Queue · Retry · Dedup        │
                    │  Registry · Health · Preference     │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      ③ Source Adapter               │
                    │  识别目标 · CapturePlan · Normalize │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      ④ Runner                       │
                    │  CLI / Native / Browser             │
                    │  timeout · kill · stdout · stderr   │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │   ⑤ Canonical Content Store         │
                    │  ContentPacket · Revision · Raw     │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      ⑥ AI Pipeline                  │
                    │  Recipe → Prompt → Targets          │
                    │  → Response Store → Viewer          │
                    └─────────────────────────────────────┘
```

### 层职责边界

| 层 | 负责 | 不负责 |
|----|------|--------|
| ① Trigger | 入口、鉴权上下文、用户意图 | 解析页面、选工具 |
| ② Orchestrator | Job 生命周期、去重、重试、策略选择 | 站点语义、进程细节 |
| ③ Source Adapter | 能否处理 URL、采什么、如何规范化 | 如何启动 CLI/浏览器 |
| ④ Runner | 执行 CapturePlan、超时与 IO | 理解「这是知乎答案」 |
| ⑤ Content Store | 权威文档、版本、原始产物 | AI 提示词 |
| ⑥ AI Pipeline | 配方、多模型分发、结果展示 | 重新采集网页 |

---

## 3. 核心设计决策

### 3.1 Adapter ≠ Runner（禁止 Adapter.build_command）

**错误模型**

```
SourceAdapter
  ├── build_command(...)   # 把执行细节绑死在适配器里
  └── parse_output(...)
```

**正确模型**

```
ZhihuAdapter
    │  can_handle(url) / preferred_fields / parse(raw) → ContentPacket
    ▼
CapturePlan          # 声明式：用谁采、采什么、参数与评分
    ▼
CLI Runner / Browser Runner / Native Runner
    ▼
RawResult
    ▼
ZhihuAdapter.normalize(raw) → ContentPacket
```

**收益**：同一 Adapter 可挂不同 Collector/Runner，无需复制站点语义。  
**当前产品约束（v1）**：采集技术只接 **OpenCLI**，不做插件市场、不做多 Collector 花式对接。架构保留 `collector` 字段与扩展点，实现上默认且唯一走 OpenCLI。

### 3.2 collector ≠ adapter

| 概念 | 绑定对象 | 示例 |
|------|----------|------|
| **adapter** | 站点语义 / 文档类型 | `zhihu`、`generic-web`、`bilibili`、`youtube` |
| **collector** | 采集技术实现 | v1 仅 **`opencli`** |

更换采集技术只换 `collector`，**Document 语义与 `adapter` 不变**。这是 Adapter 存在的根本价值。v1 不扩展其他 collector，避免过早抽象。

### 3.3 策略链按「平台 × 任务」配置，不写死全局优先级

v1 实际路径：

```
平台 Adapter → CapturePlan(collector=opencli) → CLI Runner → normalize
```

预留「平台 × 任务」评分位，便于以后加候选；**当前候选列表长度恒为 1（opencli）**。站点落地顺序：

```
知乎 → 通用网页 → B站 / YouTube
```

**Hub 选型依据**（加权）：

1. capability 匹配  
2. 健康状态（近期失败率、熔断）  
3. 用户偏好  
4. 登录状态  
5. 任务类型（全文 / 字幕 / 评论 / 元数据）  
6. 历史成功率  

---

## 4. 关键数据对象

### 4.1 流水线对象

| 对象 | 含义 |
|------|------|
| `CaptureTarget` | 用户意图：URL / 选中文本 / 本地文件 + 可选任务类型 |
| `CollectJob` | 编排单元：状态机、重试、去重键、优先级 |
| `CapturePlan` | Adapter 产出的可执行方案：候选 collectors、参数、期望字段 |
| `RawResult` | Runner 原始输出：stdout/stderr/文件路径/DOM dump/元数据 |
| `ContentPacket` | 规范化后的不可变快照（见下） |
| `DocumentRevision` | 同一 `document_id` 下的版本链 |
| `Recipe` | AI 配方：输入绑定、Prompt 模板、目标模型列表 |
| `AIResponse` | 单次模型输出，可溯源到 revision + recipe |

### 4.2 ContentPacket（Canonical Snapshot）

```json
{
  "schema_version": "1.0.0",
  "document_id": "doc_...",
  "revision_id": "rev_...",
  "source": "zhihu",
  "type": "answer",
  "url": "https://...",
  "title": "...",
  "author": "...",
  "content_md": "...",
  "content_raw": "...",
  "collector": "opencli",
  "adapter": "zhihu",
  "adapter_version": "1.0.0",
  "captured_at": "2026-08-10T12:00:00Z",
  "content_hash": "sha256:..."
}
```

**不变式**

- `schema_version` 标识 ContentPacket 协议版本，升级必递增（见 `schemas/`）  
- `document_id` 稳定（通常由规范化 URL + type 派生）  
- `revision_id` 每次成功采集递增  
- `content_hash` 用于去重与「内容是否变化」  
- `adapter` 语义权威；`collector` 仅审计/调试（v1 固定 `opencli`）  

### 4.3 CapturePlan（示意）

```json
{
  "target": { "url": "...", "task": "full_text" },
  "adapter": "zhihu",
  "candidates": [
    { "collector": "opencli", "score": 90, "params": { "cmd": "zhihu article" } },
    { "collector": "chrome-dom", "score": 50, "params": { "selectors": ["..."] } }
  ],
  "required_fields": ["title", "author", "content_md"],
  "timeout_ms": 60000
}
```

---

## 5. 子系统设计

### 5.1 Trigger

| 入口 | 用途 | UX 要点 |
|------|------|---------|
| Chrome Extension | 当前页一键捕获、选中文本 | 两步内完成；明确进度与失败原因 |
| CLI | 脚本/批量/CI | 机器可读 JSON 输出；非 0 退出码有语义 |
| Schedule | 订阅更新、定时刷新 | 静默成功 + 失败可告警 |
| Local API | 与其他本地工具集成 | 稳定 OpenAPI 契约 |

### 5.2 Hub Orchestrator

- **Job 状态**：`queued → planning → running → normalizing → stored → (ai_pending) → done / failed / cancelled`  
- **Dedup**：同一 `document_id` + 短时间窗内相同 `content_hash` 可跳过  
- **Retry**：仅对可恢复错误；换候选 collector 优于盲目重试同一路径  
- **Registry**：Adapter 注册、capability 声明、健康探针  

### 5.3 Source Adapter

每个 Adapter 最小接口：

```text
can_handle(target) → bool | confidence
plan(target, context) → CapturePlan
normalize(raw, plan) → ContentPacket
```

可选：`enrich(packet)`（补全作者主页、标签等，不得阻塞主路径）。

### 5.4 Runner

| 类型 | 适用 | 约束 |
|------|------|------|
| CLI Runner | yt-dlp、OpenCLI、站点 CLI | 超时、进程组 kill、stdout 限额 |
| Native Runner | 进程内 Python/库调用 | 取消令牌、无全局副作用 |
| Browser Runner | Extension / Playwright | 会话隔离、登录态策略、反自动化降级 |

Runner **只执行** `CapturePlan` 中选定的一项，返回 `RawResult`，不解析站点语义。

### 5.5 Canonical Content Store

- 存储：Document 元数据 + Revision 列表 + Raw 归档（可选压缩）  
- 查询：按 source/type/url/hash/时间  
- 导出：Markdown / 打包 ZIP / 未来可同步  
- **Local-first**：默认数据不出本机；云同步为后续可选层  

### 5.6 AI Pipeline

```
Recipe ──► Prompt Builder ──► Multi-AI Dispatcher
                                  │
                    API 优先 ──► 网页注入兜底
                                  ▼
                           Response Store
                                  ▼
                    Markdown / Mermaid / HTML Viewer
```

- **API 优先**：可计费、可流式、可结构化  
- **网页注入兜底**：无 API Key 时降级（明确提示能力与限制）  
- Recipe 绑定 `revision_id`，保证可复现  

---

## 6. 站点落地顺序与 Collector（v1）

| 顺序 | 平台 | Adapter | Collector（v1） |
|------|------|---------|-----------------|
| 1 | 知乎文章/回答 | `zhihu` | `opencli` |
| 2 | 通用网页 | `generic-web` | `opencli` |
| 3 | B站 / YouTube | `bilibili` / `youtube` | `opencli` |

**扩展新站点**：实现 Adapter + `plan` 指向 OpenCLI 参数 + `normalize`。不引入第二套 collector，直到 OpenCLI 明确不够用。

---

## 7. 非功能需求

| 类别 | 目标 |
|------|------|
| 可靠性 | 单 Job 失败不拖垮队列；熔断坏 collector |
| 可观测 | Job 全程 trace：plan 候选、实际 collector、耗时、错误码 |
| 安全 | 本地密钥隔离；不默认上传内容；Browser 权限最小化 |
| 性能 | 采集路径 p95 以秒级为目标；AI 路径支持流式与取消 |
| 可测试 | Adapter/normalize 纯函数可单测；Runner 用 fixture 回放 |
| 可演进 | 可插拔 Adapter（非插件市场）；ContentPacket `schema_version` 版本化 |

---

## 8. UX / 产品界面原则（Local Hub）

面向「个人工具」而非「企业控制台」：

1. **捕获优先**：扩展图标 / 快捷键 → 立即反馈「已入队」  
2. **文档中心**：列表 + 预览 + 版本时间线；内容 hash 变化时高亮「有更新」  
3. **透明失败**：展示「尝试了谁 → 为什么失败 → 下一步建议」，禁止只显示 Error  
4. **AI 工作台**：选 Recipe、选模型、流式输出；可对比多次 Response  
5. **设置克制**：登录态、默认策略、存储路径；高级 Registry 可折叠  
6. **无障碍与密度**：键盘可达；信息密度适中（桌面工具允许比移动端更密）  

建议信息架构：

```
Capture Flow
├── Inbox / Jobs（进行中）
├── Library（Documents）
│     └── Document Detail（Revisions · Raw · AI）
├── Recipes
├── Collectors（健康与登录）
└── Settings
```

---

## 9. 技术栈（已锁定）

> **一句话**：**Go 管「系统」；Bun/TypeScript 管「界面和浏览器」。**

### 9.1 选型结论

| 维度 | 决策 | 说明 |
|------|------|------|
| 运行时形态 | **本地 Daemon + 薄 UI / 扩展** | Hub 长期常驻；CLI / Extension / Web 均连本机 API |
| Hub 主语言 | **Go** | 并发任务、子进程、超时取消、调度、常驻服务 |
| 前端生态 | **Bun + TypeScript** | Web UI、Chrome Extension、共享类型、测试与构建 |
| 存储 | **SQLite + 大对象外置文件** | 索引/Job/去重在 SQLite；raw / md 落 `data/` |
| 通信 | **REST 优先**；WebSocket 后置 | M1 用 REST + 轮询；WS 仅以后流式/推送需要时再加 |
| 外部 Collector | **仅 OpenCLI** | 子进程调用；不做多工具插件对接 |
| AI（MVP） | **OpenAI 兼容多 baseURL** | Dispatcher 适配层；网页注入后置 |
| 站点顺序 | **知乎 → 通用网页 → B站/YouTube** | 知乎验证完整语义链路，避免过早做成 Web Clipper |
| 桌面封装（远期） | **Wails + Go + React** | 与 Go Hub 同栈，避免 Electron 过重 |

**明确不选（v1）**：全量 Bun 做 Hub、Rust 重写核心、Python 做 Daemon、Electron、多 Collector 插件生态、M1 上 WebSocket。

### 9.2 职责切分

```text
Hub / Daemon        Go
├─ Orchestrator
├─ Job Queue
├─ Adapter Registry
├─ Runner（CLI / Native / Browser bridge）
├─ SQLite + 文件存储
├─ REST / WebSocket API
└─ AI Dispatcher（HTTP client）

前端生态            Bun + TypeScript
├─ React + Vite（Local Hub UI）
├─ Chrome Extension
├─ packages/protocol（Adapter SDK 类型 / JSON Schema）
└─ 测试 / 构建 / lint

外部 Collector      独立进程
└─ OpenCLI（v1 唯一）
```

| 组件 | 技术 | 边界 |
|------|------|------|
| Daemon | Go | 编排、队列、Registry、Runner、Store、API |
| `capture` CLI | Go（同一模块或 `cmd/capture`） | 调本机 API 或直连 orchestrator |
| Web UI | React + Vite + Bun | 只消费 REST；不嵌采集逻辑 |
| Extension | TS + Bun 构建 | 触发捕获；经本机 API 入队 |
| Protocol | JSON Schema + TS 类型（可由 schema 生成） | ContentPacket / Job / Plan 跨语言契约 |
| Go 侧契约 | 手写 struct + 校验，或 schema 生成 | 与 protocol 包版本对齐 |
| Collector | **OpenCLI** | Hub 只传参、管生命周期、收 RawResult |

### 9.3 仓库物理布局（目标 monorepo）

```text
capture-flow/
├── cmd/
│   ├── hub/                 # Go daemon 入口
│   └── capture/             # Go CLI 入口
├── internal/                # Go 私有实现
│   ├── orchestrator/
│   ├── registry/
│   ├── adapter/             # 站点语义（plan + normalize）
│   ├── runner/              # CLI / browser bridge
│   ├── store/
│   ├── ai/
│   └── api/                 # REST（WS 后置）
├── pkg/                     # 可选：对外 Go 库
├── web/                     # React + Vite（Bun）
├── extension/               # Chrome Extension（Bun）
├── packages/
│   └── protocol/            # JSON Schema + TS 类型（Adapter SDK）
├── data/                    # 本地运行时数据（gitignore）
├── schemas/                 # 权威 ContentPacket 等 schema（可与 protocol 同源）
├── ARCHITECTURE.md
├── TASKS.md
└── go.mod
```

契约流：

```text
schemas/*.json  ──►  packages/protocol（TS）
                 └──► internal 校验 / Go struct（生成或手写同步）
```

### 9.4 运行时关系

```text
Chrome Ext / Web UI / CLI
        │  REST (localhost；M1 轮询状态)
        ▼
   Go Hub Daemon
        │  CapturePlan (collector=opencli)
        ▼
   Runner ── subprocess ──► OpenCLI
        │
        ▼
   SQLite + data/raw|md
        │
        ▼
   AI Providers (OpenAI-compatible)
```

### 9.5 模块边界（逻辑包 ↔ 实现）

| 逻辑层 | 实现位置 |
|--------|----------|
| ① Trigger | `extension/`、`cmd/capture`、`internal/api`、scheduler |
| ② Orchestrator | `internal/orchestrator` |
| ③ Source Adapter | `internal/adapter/*` |
| ④ Runner | `internal/runner/*` |
| ⑤ Content Store | `internal/store` |
| ⑥ AI Pipeline | `internal/ai` + `web` Viewer |
| 共享协议 | `schemas/` + `packages/protocol` |

---

## 10. 与 v001 的对应关系

| v001 要点 | 本文落点 |
|-----------|----------|
| Personal AI Hub 分层图 | §2 六层架构 |
| 默认采集优先级 | §3.3 / §6 |
| 抓取外包、协议自控 | §1 原则 |
| Adapter 不 build_command | §3.1 |
| 平台×任务 Strategy Chain | §3.3 |
| ContentPacket 升级 | §4.2 |
| collector ≠ adapter | §3.2 |
| Trigger→…→ContentPacket | §1.1 / §4.1 |
| Multi-AI / API 优先 | §5.6、§9.1 |

---

## 11. 已关闭与仍开放的问题

### 已锁定

| 议题 | 结论 |
|------|------|
| 运行时 | 本地 Go Daemon + 薄客户端 |
| Hub 语言 | **Go**（非 Bun Hub） |
| UI / 扩展 | **Bun + TypeScript**（React + Vite） |
| 存储 | SQLite + 外置大对象 |
| 通信 | REST 优先（M1 无 WS） |
| Collector | **仅 OpenCLI** |
| 站点顺序 | 知乎 → 通用网页 → B站/YouTube |
| ContentPacket | 必含 `schema_version` |
| 远期桌面 | Wails + Go + React（非 MVP） |

### 实现细节（不阻塞 M1，实现中再定）

1. AI 默认 provider 与密钥路径  
2. Schema → Go 手写同步 vs 代码生成  
3. go / bun 具体版本钉扎  

> **v1 架构基线**：不再扩展架构讨论；进入 M1 实现。最大风险是继续设计而不落地。

---

*Document status: v1 baseline locked (Go Hub · Bun/TS · OpenCLI only · 知乎优先). Implementation follows TASKS M1.*
