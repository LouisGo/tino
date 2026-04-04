# Tino Handoff

> 最后更新：2026-04-04  
> 当前基线提交：`385d6eb`（本轮业务开发起点）  
> 当前工作区状态：`dirty`（存在未提交文档改动：`docs/README.md`）

## 1. 文档目的

这份文档是 `Tino` 项目的长期交接手册。  
它的目标不是记录所有历史讨论，而是让任何一个新会话都能快速回答下面几个问题：

- 这个项目要做什么，不做什么
- 当前做到哪一步了
- 哪些约束已经冻结，不能随便改
- 下一步最应该做什么
- 跑项目、校验项目、继续开发分别要看哪些文件

这份文档应持续维护。每次进入新阶段时，优先更新这里，而不是依赖上下文记忆。

## 2. 项目一句话定义

`Tino` 是一个运行在 `macOS` 上的个人信息流入口层工具：  
以低摩擦方式收集用户输入，用 AI 做批量整理，最终以 `Markdown` 落盘，供 Obsidian / 思源笔记等系统直接使用。

## 3. 参考文档

按优先级阅读：

1. [需求原型文档](/Users/louistation/MySpace/Life/tino/docs/02-product/个人信息流软件需求原型文档.md)
2. [技术冻结记录](/Users/louistation/MySpace/Life/tino/docs/03-planning/技术冻结记录.md)
3. [MVP开发任务拆解](/Users/louistation/MySpace/Life/tino/docs/03-planning/MVP开发任务拆解.md)
4. [头脑风暴原始记录](/Users/louistation/MySpace/Life/tino/docs/01-discovery/个人信息流软件头脑风暴全过程.md)

阅读顺序建议：

- 新会话第一次接手：先看 `技术冻结记录` + 本文
- 要理解产品目标：再看 `需求原型文档`
- 要继续实现：再看 `MVP开发任务拆解`

## 4. 当前阶段判断

当前项目处于：

- `M0 技术冻结`：已完成
- `M1 App Shell`：已完成
- `M2 Capture`：已完成最小真实链路
- `M4 Archive Pipeline`：已完成最小真实链路
- `M3 Processing Orchestrator`：已完成最小版本
- `M8 Debug / Observability`：已有最小真实数据面板
- `M5 AI Pipeline` / `M6 Knowledge Output`：未开始

换句话说：

- 壳层已经稳定
- 从 `剪贴板 -> CaptureRecord -> daily/*.md` 的无 AI 闭环已经打通
- `_system/runtime.json`、`queue.json`、`filters.log`、`batches/*.json` 已开始真实写入
- dashboard 和 settings 已经接上真实 Rust 侧状态与设置持久化
- 但 AI 批处理、`topics/` / `_inbox/` 输出、topic index、历史补跑仍未开始

## 5. 当前已完成内容

### 5.1 基础技术栈

已接入：

- `Tauri 2`
- `React 19 + Vite`
- `Tailwind CSS v4`
- `shadcn/ui` 基础组件基座
- `Zustand`
- `TanStack Router / Query / Table / Form`

关键文件：

- [package.json](/Users/louistation/MySpace/Life/tino/package.json)
- [vite.config.ts](/Users/louistation/MySpace/Life/tino/vite.config.ts)
- [components.json](/Users/louistation/MySpace/Life/tino/components.json)
- [src/index.css](/Users/louistation/MySpace/Life/tino/src/index.css)

### 5.2 Tauri 桌面壳层

已完成：

- 主窗口配置
- tray 图标与菜单
- 点击关闭时隐藏窗口
- autostart / dialog / fs / opener 插件接入
- Rust 命令桥接入真实状态管理

关键文件：

- [src-tauri/tauri.conf.json](/Users/louistation/MySpace/Life/tino/src-tauri/tauri.conf.json)
- [src-tauri/src/lib.rs](/Users/louistation/MySpace/Life/tino/src-tauri/src/lib.rs)
- [src-tauri/src/commands/shell.rs](/Users/louistation/MySpace/Life/tino/src-tauri/src/commands/shell.rs)
- [src-tauri/capabilities/default.json](/Users/louistation/MySpace/Life/tino/src-tauri/capabilities/default.json)

### 5.3 前端应用壳层

已完成：

- Query client
- Router
- App frame
- Dashboard 调试页
- Settings 设置页
- Zustand 壳层状态
- Tauri JS 侧桥接助手
- dashboard / settings 真实 Rust 命令接入

关键文件：

- [src/app/providers.tsx](/Users/louistation/MySpace/Life/tino/src/app/providers.tsx)
- [src/router.tsx](/Users/louistation/MySpace/Life/tino/src/router.tsx)
- [src/routes/root-shell.tsx](/Users/louistation/MySpace/Life/tino/src/routes/root-shell.tsx)
- [src/components/shell/app-frame.tsx](/Users/louistation/MySpace/Life/tino/src/components/shell/app-frame.tsx)
- [src/features/dashboard/dashboard-page.tsx](/Users/louistation/MySpace/Life/tino/src/features/dashboard/dashboard-page.tsx)
- [src/features/settings/settings-form.tsx](/Users/louistation/MySpace/Life/tino/src/features/settings/settings-form.tsx)
- [src/stores/app-shell-store.ts](/Users/louistation/MySpace/Life/tino/src/stores/app-shell-store.ts)
- [src/lib/tauri.ts](/Users/louistation/MySpace/Life/tino/src/lib/tauri.ts)

### 5.4 已落地的真实业务链路

已完成：

- Rust 侧轮询 `NSPasteboard.changeCount`
- 生成稳定的 `CaptureRecord`
- 纯文本 / 富文本写入 `daily/YYYY-MM-DD.md`
- 知识根目录与敏感配置的最小持久化
- `_system/runtime.json` 运行态快照
- `_system/queue.json` 待处理队列
- `_system/filters.log` 最小过滤日志
- `_system/batches/*.json` 批次提升占位
- 最小过滤规则
- `5 分钟` 完全相同内容去重
- `20 条`或`10 分钟` 的批次触发已落地，但只生成 `pending_ai` 批次文件，不调用模型

关键文件：

- [src-tauri/src/app_state.rs](/Users/louistation/MySpace/Life/tino/src-tauri/src/app_state.rs)
- [src-tauri/src/capture.rs](/Users/louistation/MySpace/Life/tino/src-tauri/src/capture.rs)

### 5.5 校验链路

当前以下命令通过：

```bash
pnpm check
pnpm build
```

说明：

- `pnpm tauri dev` 在壳层阶段已通过
- 本轮没有重新做 GUI 人工 smoke test；如果要继续打磨剪贴板体验，建议重新跑一次 `pnpm tauri dev`

## 6. 当前未完成内容

以下是下一阶段仍未完成的内容：

- 剪贴板体验打磨
- 富文本保真度与噪声内容处理继续收敛
- 暂停 / 恢复采集的真实语义落地
- 最近队列 / 最近批次的更细调试视图
- AI 批次消费与 schema 校验
- `topics/` / `_inbox/` Markdown 输出
- topic index 维护
- 历史补跑

## 7. 不允许随意漂移的冻结约束

以下约束已经拍板，继续开发时不要轻易改：

### 7.1 应用形态

- 必须常驻后台
- 必须有 `menubar / tray + Dock + 主窗口`
- 主窗口关闭时只 `hide`
- 点击 tray 和 Dock 都打开主窗口

### 7.2 主窗口边界

MVP 主窗口只做：

- 当前状态概览
- 知识根目录设置
- AI Provider 设置
- 最近队列 / 最近批次调试信息
- 手动触发批处理、暂停 / 恢复采集

不要在这个阶段加：

- 聊天窗口
- 笔记编辑器
- 历史浏览器
- 可视化统计大盘

### 7.3 核心职责分层

- 剪贴板轮询：`Rust`
- 本地文件读写：`Rust`
- AI 调用：`前端`
- Agent runtime / prompt 编排 / streaming UI：`Renderer`
- Agent tools 的真实副作用：`Rust command`
- 运行态：`_system/ JSON`

### 7.4 数据策略

- `daily/`：按天一个 Markdown 文件
- `topics/`：每个 topic 一个长期 Markdown 文件
- `_inbox/`：按天一个 Markdown 文件
- 原始归档与 AI 提炼必须双轨隔离

### 7.5 AI 策略

- 批量处理，不做逐条实时
- 触发条件：`20 条`或`10 分钟`
- 允许一个批次拆分到多个 topic
- 批次内按“先聚类再输出”
- 低置信度进入 `_inbox`
- AI 输出必须结构化，不能直接控制真实文件路径

### 7.6 当前已冻结但尚未完整实现的交互规则

- 未配置 AI 时只做 `daily` 归档，不自动累计 AI 债务
- 历史补跑只按“天”处理
- 暂停采集不等于关闭剪贴板监听

## 8. 当前项目结构

```text
.
├─ docs/
│  ├─ 01-discovery/
│  ├─ 02-product/
│  └─ 03-planning/
├─ public/
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  ├─ hooks/
│  ├─ lib/
│  ├─ routes/
│  ├─ stores/
│  └─ types/
├─ src-tauri/
│  ├─ capabilities/
│  ├─ icons/
│  └─ src/
└─ rust-toolchain.toml
```

这套结构目前仍然合理，不需要为了继续做主链路再做目录级重构。

## 9. 下一步推荐开发顺序

严格按下面顺序推进，不要跳：

1. 剪贴板体验打磨
2. `M8 Debug / Observability` 补足最近队列 / 最近批次视图
3. `M7 Config / Skill Stub` 的最小持久化补口
4. `M5 AI Pipeline`
5. `M6 Knowledge Output`

当前最推荐的具体下一步是：

### Next Task

打磨 `剪贴板采集体验`，但仍然停留在无 AI / 低 AI 耦合阶段。

建议拆成三步：

1. 收敛噪声：继续调过滤规则、避免误收与高频无意义复制
2. 提升可控性：把暂停 / 恢复采集的真实语义接到 Rust 主链路
3. 提高可见性：在主窗口明确看到最近 capture、队列、批次状态

为什么现在先做这个：

- 第一条真实业务链路已经打通，当前短板不是“有没有”，而是“好不好用”
- AI 还没开始，先把输入侧质量和体验收紧，后面 AI 才不会背锅
- 这一阶段的调整不会破坏冻结边界，但会显著影响日常使用感受

## 10. 当前代码里的“真实”与“占位”

### 已真实可用

- Tauri 窗口与 tray
- autostart 插件接入
- 目录选择器弹窗
- 主窗口关闭即隐藏
- 路由、状态、表单、表格等前端基础设施
- settings 的最小真实持久化
- dashboard 的真实 snapshot
- Rust 剪贴板轮询
- `CaptureRecord` 生成
- `daily` 归档
- `_system` 运行态 / 队列 / 过滤日志 / 批次文件

### 仍是占位 / 未完成

- AI 批次消费
- AI 结构化输出 schema
- `topics/` / `_inbox/` 落盘
- topic index 维护
- 历史补跑
- 剪贴板体验细节与暂停语义

## 11. 开发命令

```bash
pnpm install
pnpm check
pnpm build
pnpm tauri dev
```

如果只做 Rust 校验：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 12. 代码改动原则

继续开发时遵守：

- 优先保持冻结边界，不要边写边改架构方向
- 先打通主链路，再做抽象
- 不要把 AI、文件写入、捕获、缓冲耦在一个模块里
- Rust 负责系统与本地资源，前端负责 AI 与 UI
- 不要引入数据库来“提前优化” `_system`
- 不要把 `daily` 当成 AI 默认长期上下文
- 当前阶段优先改善输入质量与可控性，不要抢着扩功能面

## 13. 新会话接手模板

如果在新会话中继续开发，建议直接给出类似说明：

```text
请先阅读：
1. docs/03-planning/HANDOFF.md
2. docs/03-planning/技术冻结记录.md
3. docs/03-planning/MVP开发任务拆解.md

当前任务：
优先打磨剪贴板采集体验，不要先做 AI。

当前真实状态：
- Rust 剪贴板轮询已上线
- CaptureRecord + daily 归档已打通
- queue / filters / batches 文件已开始真实写入
- AI 还未开始，只到 pending_ai batch

要求：
- 不修改冻结边界
- 优先改善输入侧体验与调试可见性
- 文件写入继续放 Rust
- 完成后至少跑 pnpm check 和 pnpm build
```

## 14. 维护规则

每次完成一个阶段后，至少更新这四项：

- `最后更新` 日期
- `当前基线提交`
- `当前阶段判断`
- `下一步推荐开发顺序` 中的 `Next Task`

如果发生架构级变化，还必须同步更新：

- [技术冻结记录](/Users/louistation/MySpace/Life/tino/docs/03-planning/技术冻结记录.md)
- [MVP开发任务拆解](/Users/louistation/MySpace/Life/tino/docs/03-planning/MVP开发任务拆解.md)

## 15. 当前结论

这个仓库已经不再只是一个桌面壳。  
它已经具备一条真实可运行的无 AI 采集闭环，并且开始写入最小运行态与批次文件。  
下一阶段不应该急着接 AI，而应该先把剪贴板输入体验、过滤质量、可控性和可见性打磨好。
