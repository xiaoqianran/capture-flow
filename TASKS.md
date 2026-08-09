# Capture Flow — Tasks

> 从 `v001.txt` / `ARCHITECTURE.md` 拆出的可执行任务清单。  
> 状态：`todo` · `doing` · `blocked` · `done`  
> 优先级：P0 必须 / P1 重要 / P2 增强

---

## 里程碑总览

| 里程碑 | 目标 | 退出标准 |
|--------|------|----------|
| **M0** 基线 | 仓库、规范、技术栈锁定 | 文档齐、栈决策写入 ARCHITECTURE |
| **M1** 骨架 | 六层空壳可跑通假数据 | 一条假 Job 产出 ContentPacket |
| **M2** 真实采集 MVP | 至少 1 站点端到端 | URL → Packet → 本地存储可查 |
| **M3** 多 Collector 策略 | Strategy Chain + 失败切换 | 首选失败自动降级成功 |
| **M4** AI Pipeline | Recipe + 至少 1 模型 API | Packet → Markdown 回答可存可看 |
| **M5** 人机入口 | CLI + Chrome 最小扩展 | 日常捕获不靠手写 curl |
| **M6** Hub 体验 | Library / Jobs / 失败透明 | 本地 UI 可完成主路径 |

当前焦点：**M0 收尾 → M1 Go Hub 骨架**。

**技术栈（已锁定）**：Hub/Daemon = **Go**；Web/Extension/Protocol = **Bun + TypeScript**；Collector = **仅 OpenCLI**；站点顺序 = **知乎 → 通用网页 → B站/YouTube**。详见 `ARCHITECTURE.md` §9。

---

## M0 — 基线与约定

| ID | 任务 | 优先级 | 状态 | 说明 |
|----|------|--------|------|------|
| M0-01 | 沉淀 `ARCHITECTURE.md` | P0 | done | 从 v001 延伸 |
| M0-02 | 沉淀 `TASKS.md` | P0 | done | 本文 |
| M0-03 | 技术栈选型讨论并锁定 | P0 | done | Go Hub + Bun/TS 客户端 |
| M0-04 | Commit / PR / 目录约定 | P0 | todo | 阿里规范；落地 monorepo 骨架属 M1-01 |
| M0-05 | 最小 README（产品一句话 + 如何跑） | P1 | todo | 写明 Go / Bun 双工具链 |
| M0-06 | ContentPacket JSON Schema 初版 | P0 | todo | `schemas/` + `schema_version` |
| M0-07 | 错误码与 Job 状态机枚举 | P0 | todo | 可恢复 / 不可恢复；跨 Go/TS 同源 |

---

## M1 — 可运行骨架（Go Daemon）

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M1-01 | 初始化 monorepo：`cmd/hub`、`internal/*`、`web/`、`packages/protocol` | P0 | todo | M0-03 |
| M1-02 | 协议：JSON Schema + TS 类型；Go struct 对齐 | P0 | todo | M0-06 |
| M1-03 | Orchestrator：内存队列 + Job 状态机（Go） | P0 | todo | M1-02 |
| M1-04 | FakeAdapter + FakeRunner 通路（Go） | P0 | todo | M1-03 |
| M1-05 | Store：SQLite 元数据 + Packet/文件落盘 | P0 | todo | M1-02 |
| M1-06 | 集成测试：假 URL → ContentPacket（`go test`） | P0 | todo | M1-04, M1-05 |
| M1-07 | 结构化日志 / Job trace 字段 | P1 | todo | M1-03 |
| M1-08 | 最小 REST：`POST /jobs`、`GET /jobs/:id`、`GET /docs/:id`（轮询即可） | P0 | todo | M1-03, M1-05 |
| M1-09 | WebSocket：Job 状态推送 | P2 | todo | 非 M1；REST 轮询足够 |

**M1 真正目标**：`Job → Adapter → Runner → Packet → SQLite`（假数据贯通）。  
**退出**：`curl POST /jobs` → FakeAdapter → FakeRunner → ContentPacket → SQLite，可 `GET` 查回。
---

## M2 — 真实采集 MVP（首站：知乎）

站点顺序：**知乎 → 通用网页 → B站/YouTube**。Collector：**仅 OpenCLI**。

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M2-01 | CLI Runner（timeout / kill / 捕获 IO，调 OpenCLI） | P0 | todo | M1 |
| M2-02 | 知乎 Adapter（plan + normalize） | P0 | todo | M2-01 |
| M2-03 | 接入 OpenCLI（唯一真实 collector） | P0 | todo | M2-01 |
| M2-04 | document_id / content_hash 规则 | P0 | todo | M0-06 |
| M2-05 | Dedup：同 hash 跳过写 revision | P1 | todo | M2-04 |
| M2-06 | Raw 归档策略（保留/轮转） | P1 | todo | M1-05 |
| M2-07 | 端到端：真实 URL → Library 可打开 | P0 | todo | M2-02..04 |

**退出**：对 3 个真实样例 URL 稳定成功 ≥ 2/3。

---

## M3 — 策略链与可靠性

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M3-01 | Registry：Adapter/Collector 注册与 capability | P0 | todo | M1 |
| M3-02 | CapturePlan 多候选 + 评分 | P0 | todo | M3-01 |
| M3-03 | 失败换下一候选（非盲目重试） | P0 | todo | M3-02 |
| M3-04 | Collector 健康分 / 简单熔断 | P1 | todo | M3-03 |
| M3-05 | （不设 Browser Runner）v1 不接 DOM/Playwright 插件 | — | cancelled | 仅 OpenCLI |
| M3-06 | 第二平台：通用网页 Adapter | P1 | todo | M2 |
| M3-06b | 第三平台：B站 / YouTube Adapter | P2 | todo | M3-06 |
| M3-07 | 平台×任务 strategy 配置表 | P0 | todo | M3-01 |

**退出**：人为搞挂首选 collector 后仍能降级成功，且 Job trace 可审计。

---

## M4 — AI Pipeline

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M4-01 | Recipe 模型（输入绑定 + prompt 模板） | P0 | todo | M2-07 |
| M4-02 | Prompt Builder（注入 Packet 字段） | P0 | todo | M4-01 |
| M4-03 | Dispatcher：OpenAI 兼容 API 优先 | P0 | todo | M4-02 |
| M4-04 | Response Store（关联 revision + recipe） | P0 | todo | M4-03 |
| M4-05 | 流式输出 + 取消 | P1 | todo | M4-03 |
| M4-06 | 网页注入兜底（明确能力边界） | P2 | todo | M4-03 |
| M4-07 | 导出 Markdown / 简易 HTML | P1 | todo | M4-04 |

**退出**：对一份 Packet 跑默认 Recipe，得到可打开的回答文件。

---

## M5 — Trigger：CLI + Chrome

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M5-01 | CLI：`capture` / `job status` / `doc show` | P0 | todo | M2 |
| M5-02 | 本地 HTTP API（触发采集 + 查询） | P0 | todo | M1 |
| M5-03 | Chrome Extension：当前页捕获 | P0 | todo | M5-02 |
| M5-04 | Extension：选中文本捕获 | P1 | todo | M5-03 |
| M5-05 | Schedule 触发器（cron 式） | P2 | todo | M5-01 |
| M5-06 | 进度与失败文案（用户可读） | P0 | todo | M3-03 |

**退出**：浏览器一点 → Hub 入库；CLI 可复现同一 Job。

---

## M6 — Local Hub 体验

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M6-01 | IA：Jobs / Library / Recipes / Settings | P0 | todo | M0-03 |
| M6-02 | Jobs 列表：状态、耗时、collector 轨迹 | P0 | todo | M5 |
| M6-03 | Document 详情：版本时间线 + MD 预览 | P0 | todo | M2 |
| M6-04 | AI 工作台：选 Recipe、流式、历史 Response | P1 | todo | M4 |
| M6-05 | Collectors 健康与登录提示 | P1 | todo | M3-04 |
| M6-06 | 空态 / 加载 / 错误 三态打磨 | P1 | todo | M6-02 |
| M6-07 | 键盘快捷键与基础 a11y | P2 | todo | M6-01 |

**退出**：不看日志也能完成「捕获 → 阅读 → 问 AI」。

---

## 横切任务（穿插各里程碑）

| ID | 任务 | 优先级 | 状态 |
|----|------|--------|------|
| X-01 | 单元测试：normalize 纯函数 + fixture | P0 | todo |
| X-02 | 契约测试：ContentPacket schema | P0 | todo |
| X-03 | 密钥与配置：环境变量 / 本地 config，不入库 | P0 | todo |
| X-04 | 可观测：统一 trace_id 贯穿 Job | P1 | todo |
| X-05 | 文档：Adapter 编写指南 | P1 | todo |
| X-06 | 性能预算：Runner 超时默认值与大 stdout 限制 | P1 | todo |

---

## 建议实施顺序（最短闭环）

```
M0-06 ContentPacket Schema
 → M0-07 Job / Error Enum
 → M1-01 Go monorepo
 → FakeAdapter + FakeRunner
 → SQLite
 → POST /jobs
 → （跑通后）M2 真实知乎 + OpenCLI
```

原则：**先假数据贯通内核；再接知乎+OpenCLI；不扩第二 collector；M1 不上 WebSocket。**
---

## 技术栈决策记录（M0-03 关闭）

### 最终方案

```text
Hub / Daemon        Go
├─ Orchestrator · Job Queue · Registry · Runner
├─ SQLite · REST / WebSocket
└─ AI Dispatcher

前端生态            Bun + TypeScript
├─ React + Vite · Chrome Extension
├─ packages/protocol（类型 / Schema）
└─ 测试 / 构建

外部 Collector      **仅 OpenCLI**
远期桌面            Wails + Go + React
```

### 对照表

| 维度 | 结论 | 曾备选 |
|------|------|--------|
| 运行时 | 本地 Go Daemon + 薄客户端 | Electron 一体、纯 CLI |
| Hub | **Go** | 全 Bun/TS Hub、Python Daemon |
| UI/扩展 | **Bun + TS（React + Vite）** | 无 UI、Tauri 优先 |
| 存储 | SQLite + 外置大对象 | 纯文件 |
| Collector | **仅 OpenCLI** | 多 CLI/插件生态 |
| 站点顺序 | **知乎 → 通用网页 → B站/YouTube** | 通用网页优先 |
| 通信 M1 | **REST + 轮询** | M1 WebSocket（已降为 P2） |
| AI MVP | OpenAI 兼容多 baseURL | 网页注入双路径（后置） |
| 包管理 | Go modules + Bun | pnpm/Node 亦可，默认 Bun |

### 方案评分（决策依据）

| 方案 | 推荐度 | 备注 |
|------|--------|------|
| **Go + Bun/TS** | ★★★★★ | 系统并发/子进程 vs 界面浏览器，边界清晰 |
| 全 Bun/TS | ★★★★☆ | MVP 最快；Daemon 长期运维弱于 Go |
| Go + Node/pnpm | ★★★★☆ | 更保守；与 Bun 生态取舍 |
| Rust + TS | ★★★ | MVP 复杂度不值 |
| Python + TS | ★★★ | 仅强依赖 Python 内嵌时 |

### v1 基线补充（评审 9/10）

- M1-09 WebSocket → **P2**，M1 只保证 REST 贯通  
- 首站改为 **知乎优先**  
- ContentPacket **必须** `schema_version`  
- Collector **只做 OpenCLI**，不花式对接插件  
- **停止继续架构讨论，进入实现**

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-10 | 初版：由 v001 / ARCHITECTURE 拆分里程碑与选型待议 |
| 2026-08-10 | 锁定 Go Hub + Bun/TS 客户端；M0-03 done；M1 按 Go monorepo 细化 |
| 2026-08-10 | v1 基线：OpenCLI-only、知乎优先、M1 无 WS、schema_version；开工 M1 |

---

*完成任务时请更新状态；关闭里程碑时写一句退出证据（命令或截图路径）。*
