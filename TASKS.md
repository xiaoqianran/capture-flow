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

当前焦点：**M0 → 技术栈协商与锁定**。

---

## M0 — 基线与约定

| ID | 任务 | 优先级 | 状态 | 说明 |
|----|------|--------|------|------|
| M0-01 | 沉淀 `ARCHITECTURE.md` | P0 | done | 从 v001 延伸 |
| M0-02 | 沉淀 `TASKS.md` | P0 | doing | 本文 |
| M0-03 | 技术栈选型讨论并锁定 | P0 | todo | 见文末「选型待议」 |
| M0-04 | Commit / PR / 目录约定 | P0 | todo | 阿里规范 commit；包结构落地 |
| M0-05 | 最小 README（产品一句话 + 如何跑） | P1 | todo | 栈锁定后写 |
| M0-06 | ContentPacket JSON Schema 初版 | P0 | todo | 版本字段 `schema_version` |
| M0-07 | 错误码与 Job 状态机枚举 | P0 | todo | 可恢复 / 不可恢复分类 |

---

## M1 — 可运行骨架

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M1-01 | 初始化 monorepo / 工程结构 | P0 | todo | M0-03 |
| M1-02 | 共享类型：Target / Job / Plan / Raw / Packet | P0 | todo | M0-06 |
| M1-03 | Orchestrator：内存队列 + 状态机 | P0 | todo | M1-02 |
| M1-04 | FakeAdapter + FakeRunner 通路 | P0 | todo | M1-03 |
| M1-05 | Store：Packet 落盘 + 按 id 读取 | P0 | todo | M1-02 |
| M1-06 | 集成测试：假 URL → Packet | P0 | todo | M1-04, M1-05 |
| M1-07 | 结构化日志 / Job trace 字段 | P1 | todo | M1-03 |

**退出**：`capture-flow run --fixture demo`（或等价）打印完整 Packet。

---

## M2 — 真实采集 MVP（建议首站可协商）

默认建议首站：**通用网页全文** 或 **知乎回答**（二选一，见选型）。

| ID | 任务 | 优先级 | 状态 | 依赖 |
|----|------|--------|------|------|
| M2-01 | CLI Runner（timeout / kill / 捕获 IO） | P0 | todo | M1 |
| M2-02 | 首个真实 Adapter（plan + normalize） | P0 | todo | M2-01 |
| M2-03 | 接入 1 个真实 Collector（OpenCLI 或专用 CLI） | P0 | todo | M2-01 |
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
| M3-05 | Browser Runner 最小实现（扩展或 Playwright 二选一） | P1 | todo | M2 |
| M3-06 | 第二平台 Adapter（如 B站字幕或 YouTube） | P1 | todo | M3-02 |
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
M0 文档与栈
 → M1 假数据贯通
 → M2 一个真实 Adapter + CLI Runner
 → M5-01/02 可触发
 → M3 降级策略
 → M4 最小 AI
 → M5-03 扩展
 → M6 UI 打磨
```

原则：**先协议与编排，后平台广度；先可靠入库，后漂亮 UI。**

---

## 选型待议（阻塞 M0-03 / M1-01）

以下需与产品方确认后，回写 `ARCHITECTURE.md` 并勾选 M0-03。

### A. 运行时形态

| 选项 | 优点 | 代价 |
|------|------|------|
| A1 本地 Daemon + 薄 UI/扩展 | 清晰、可 headless | 多进程运维 |
| A2 Electron/Tauri 一体应用 | 分发简单、体验完整 | 体积与耦合 |
| A3 CLI-first，UI 后置 | 最快验证架构 | 早期体验弱 |

### B. Hub 主语言

| 选项 | 优点 | 代价 |
|------|------|------|
| B1 TypeScript（Node/Bun） | 与扩展/Web UI 同构；类型好 | 调 Python CLI 需子进程 |
| B2 Python | 贴合 yt-dlp/数据脚本生态 | UI/扩展需另一栈 |
| B3 混合：TS Hub + Python collectors | 各取所长 | 双语言复杂度 |

### C. 存储

| 选项 | 优点 | 代价 |
|------|------|------|
| C1 SQLite + `data/raw|md` 文件 | 查询强、备份易 | 需 migration |
| C2 纯文件系统 + JSON/MD | 极简可观测 | 列表/检索弱 |
| C3 SQLite 为主，大对象外置 | 平衡 | 路径一致性要规范 |

### D. 首批 MVP 站点

| 选项 | 说明 |
|------|------|
| D1 通用网页 + OpenCLI/DOM | 覆盖面广，语义浅 |
| D2 知乎回答 | 验证 adapter/collector 解耦 |
| D3 B站/YouTube 字幕 | 验证专用工具链与策略链 |

### E. 前端 / Hub UI

| 选项 | 说明 |
|------|------|
| E1 本地 Web（React/Vue + 本地 API） | 迭代快，与扩展技术近 |
| E2 Tauri + Web 前端 | 桌面感强 |
| E3 暂无 UI，CLI + 文件打开 | 最快 |

### F. AI

| 选项 | 说明 |
|------|------|
| F1 仅 OpenAI 兼容 API | 实现简单 |
| F2 多厂商适配层 | 更符合 Multi-AI Dispatcher |
| F3 API + 网页注入双路径 | 对齐 v001，工作量大 |

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-10 | 初版：由 v001 / ARCHITECTURE 拆分里程碑与选型待议 |

---

*完成任务时请更新状态；关闭里程碑时写一句退出证据（命令或截图路径）。*
