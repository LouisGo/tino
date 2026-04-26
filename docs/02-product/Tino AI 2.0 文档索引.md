# Tino AI 2.0 文档索引

> 日期：2026-04-26
> 角色：当前 `Tino AI` 产品层的总入口
> 状态：最新共识；用于覆盖旧的 MVP 阶段 AI 产品口径
> 说明：这组文档已经收口到当前阶段最终的 2.0 方案

## 1. 先读什么

按顺序阅读：

1. `docs/02-product/Tino AI 2.0 产品定义.md`
2. `docs/02-product/Tino AI 2.0 主战场定义.md`
3. `docs/02-product/Tino AI 2.0 核心对象与主循环.md`
4. `docs/02-product/Tino AI 2.0 输入通道与 Capture 体系.md`
5. `docs/02-product/Tino AI 2.0 能力分层.md`
6. `docs/02-product/Tino AI 2.0 交互模式、上下文与写回协议.md`
7. `docs/02-product/Tino AI 2.0 非目标与阶段边界.md`

## 2. 这组文档解决什么问题

这组文档用于把 `Tino AI` 从“早期 MVP 的后台知识编译器构想”收口成当前阶段可执行的 2.0 共识。

它重点回答：

- `Tino AI` 现在到底是什么产品母型
- 为什么它更像 `NotebookLM` 内核而不是 `Notion AI` 本体
- 为什么它不做编辑器，却仍然是 `Markdown-first`
- 当前阶段唯一主战场是什么
- 剪贴板、导入、静默 digest、chat、Markdown artifact 在系统里分别属于哪一层
- 同一个 chat 入口里，`查 / 研 / 产` 三种意图如何区分
- corpus scope 与 artifact feedback 应该怎么定义

## 3. 文档职责划分

### 3.1 `Tino AI 2.0 产品定义`

冻结母型、角色、承诺、边界。

### 3.2 `Tino AI 2.0 主战场定义`

冻结当前阶段单一主战场与单一主循环。

### 3.3 `Tino AI 2.0 核心对象与主循环`

冻结核心对象模型：`project / source / capture / corpus / thread / digest / artifact`。

### 3.4 `Tino AI 2.0 输入通道与 Capture 体系`

冻结剪贴板、文件导入、选中唤起等输入层的正确位置。

### 3.5 `Tino AI 2.0 能力分层`

冻结从外部工作环境到 artifact 输出的整体分层。

### 3.6 `Tino AI 2.0 交互模式、上下文与写回协议`

冻结入口、意图合同、scope、上下文栈、写回协议与反馈回流。

### 3.7 `Tino AI 2.0 非目标与阶段边界`

冻结当前阶段故意不做的东西，防止范围漂移。

## 4. 旧文档如何理解

- `Tino AI 能力地图 v0.2`：保留为早期 `AI rethink` 启动阶段说明，不再作为当前真相源
- `个人信息流软件需求原型文档`：保留为早期 `MVP inbox-first` 总原型，不再单独指导当前 `AI chat / corpus copilot` 设计

## 5. 与规划文档的关系

这组文档负责“产品是什么”。

以下文档继续负责“系统如何实现”：

- `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
- `docs/03-planning/Tino AI 静默编译与显式意图执行方案 v0.1.md`
- `docs/03-planning/技术冻结记录.md`
- `docs/03-planning/HANDOFF.md`

如果后续产品母型、主战场、核心对象、输入层边界发生变化，至少同步更新：

- 本索引
- `Tino AI 2.0 产品定义`
- `Tino AI 2.0 主战场定义`
- `Tino AI 2.0 核心对象与主循环`
- `docs/03-planning/HANDOFF.md`
