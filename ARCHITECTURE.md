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

**收益**：同一个知乎 Adapter 可挂 OpenCLI、zhihu-cli、Chrome DOM 三套 Runner，无需三个 Adapter。

### 3.2 collector ≠ adapter

| 概念 | 绑定对象 | 示例 |
|------|----------|------|
| **adapter** | 站点语义 / 文档类型 | `zhihu`、`bilibili`、`youtube` |
| **collector** | 采集技术实现 | `opencli`、`yt-dlp`、`loop-bilibili`、`chrome-dom` |

更换采集技术只换 `collector`，**Document 语义与 `adapter` 不变**。这是 Adapter 存在的根本价值。

### 3.3 策略链按「平台 × 任务」配置，不写死全局优先级

全局默认仅作兜底：

```
官方 API / 成熟专用工具
  > 自研专用 Collector
  > OpenCLI
  > Chrome Extension DOM
  > Playwright
```

**真实选择**由 Registry 产出带分候选：

```
B站字幕：[loop-bilibili (100), yt-dlp (80), browser (50)]
YouTube 字幕：[yt-dlp (100), browser (40)]
知乎文章：[zhihu-cli/OpenCLI (90), Chrome DOM (50)]
选中文本：[browser (100)]
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
  "adapter_version": "1.2.0",
  "captured_at": "2026-08-10T12:00:00Z",
  "content_hash": "sha256:..."
}
```

**不变式**

- `document_id` 稳定（通常由规范化 URL + type 派生）  
- `revision_id` 每次成功采集递增  
- `content_hash` 用于去重与「内容是否变化」  
- `adapter` 语义权威；`collector` 仅审计/调试  

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

## 6. 采集优先级与 Collector 矩阵

| 平台/任务 | 首选 | 次选 | 兜底 |
|-----------|------|------|------|
| YouTube 字幕 | yt-dlp | — | Browser |
| B站字幕 | loop-bilibili | yt-dlp | Browser |
| 知乎文章/回答 | zhihu-cli / OpenCLI | — | Chrome DOM |
| 通用页面 | OpenCLI | — | Chrome / Playwright |
| 用户选中文本 | Browser | — | — |

**扩展新站点**：实现 Adapter + 声明 strategy chain + 复用已有 Runner。

---

## 7. 非功能需求

| 类别 | 目标 |
|------|------|
| 可靠性 | 单 Job 失败不拖垮队列；熔断坏 collector |
| 可观测 | Job 全程 trace：plan 候选、实际 collector、耗时、错误码 |
| 安全 | 本地密钥隔离；不默认上传内容；Browser 权限最小化 |
| 性能 | 采集路径 p95 以秒级为目标；AI 路径支持流式与取消 |
| 可测试 | Adapter/normalize 纯函数可单测；Runner 用 fixture 回放 |
| 可演进 | 插件式 Adapter/Collector；ContentPacket schema 版本化 |

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

## 9. 模块边界（逻辑包）

```
capture-flow/
  trigger/          # extension bridge, cli, http api, scheduler
  orchestrator/     # job, queue, dedup, retry, registry
  adapters/         # zhihu, bilibili, youtube, generic-web...
  runners/          # cli, native, browser
  store/            # content packet, revision, raw, index
  ai/               # recipe, prompt, dispatcher, response store
  viewer/           # md / mermaid / html render
  shared/           # types, errors, logging, config
```

物理仓库布局与实现语言在技术栈确定后落地（见 TASKS / 技术选型讨论）。

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

---

## 11. 开放问题（实现前需拍板）

1. **运行时形态**：纯本地服务 + 扩展 / Electron 一体 / 无 UI 纯 CLI 优先？  
2. **主语言**：Hub 用 TypeScript 还是 Python（与 yt-dlp/OpenCLI 生态贴合度 vs 扩展一体性）？  
3. **存储引擎**：SQLite + 文件系统 vs 纯文件目录？  
4. **首批 Adapter 范围**：知乎 / B站 / YouTube / 通用网页 的 MVP 边界？  
5. **AI Provider**：仅 OpenAI 兼容 API，还是内置多厂商 + 网页注入？  

> 技术栈协商见对话；确认后写入本文 §9 实现映射与 `TASKS.md` 里程碑。

---

*Document status: draft derived from `v001.txt`. Update when stack is locked.*
