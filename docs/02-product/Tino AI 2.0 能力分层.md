# Tino AI 2.0 能力分层

> 日期：2026-04-26
> 角色：当前 `Tino AI` 的系统能力分层定义
> 状态：最新共识
> 说明：本文件解决“剪贴板、导入、语料、chat、静默 digest、Markdown 产出分别属于哪一层”的问题

## 1. 分层原则

`Tino AI` 的能力不应再按页面功能去理解，而应按以下顺序理解：

1. 用户实际工作的外部环境是什么
2. 输入如何进入系统
3. 输入如何被 capture 和标准化
4. 材料如何变成统一 Markdown 语料
5. AI 围绕什么对象工作
6. 结果如何被输出和治理

## 2. Layer 0: External Work Surfaces

这是用户真正工作和写作的地方。

包括：

- Notion
- Obsidian
- 思源
- VSCode
- 浏览器
- PDF / PPT / Excel 阅读或编辑环境

`Tino` 不接管这一层。

## 3. Layer 1: Input Adapter Layer

这一层负责把东西带进来。

包括：

- clipboard
- file import
- link import
- drag-and-drop import
- selected text invoke
- global quick window input

剪贴板在这一层是一等能力，不是边缘功能。

## 4. Layer 2: Capture Pipeline Layer

这一层负责把输入变成“合格的可处理输入”。

包括：

- standardization
- deduplication
- minimal filtering
- secret / token guard
- pause / resume
- retention
- capture history

这也是剪贴板能力和原始输入历史真正落位的地方。

## 5. Layer 3: Source and Corpus Normalization Layer

这一层负责把任意输入统一转换为 AI 工作语料。

包括：

- 保留原始 source
- 生成 Markdown 语料表示
- 记录 provenance
- 维护引用定位关系

这里的关键共识是：

> 不是“只有 Markdown 才能进来”，而是“任意输入都要归一成可追溯 Markdown 语料层”。

## 6. Layer 4: Project and Corpus Layer

这一层定义 AI 当前真正围绕什么对象工作。

核心对象：

- `Project`
- `Source`
- `Corpus Document`
- `Thread`
- `Digest`
- `Artifact`

当前阶段的核心判断是：

> `Tino AI` 围绕 `project / corpus` 工作，而不是围绕“一个空泛的聊天框”工作。

Layer 3 -> Layer 4 的最小协议是：

- explicit target project
- active project context
- fallback to inbox project

而不是让 source 在无归属状态下长期漂浮。

## 7. Layer 5: AI Work Layer

这一层是用户真正感知到的 AI 能力层。

当前应优先做强：

- grounded ask
- grounded retrieval
- research
- rewrite / summarize
- recent digest
- resurfacing

当前不应喧宾夺主的层：

- 高自治执行
- 重陪伴人格记忆
- 过早扩张的通用 agent

## 8. Layer 6: Artifact Layer

这一层负责正式产出。

典型输出：

- direct answer
- cited answer
- note draft
- summary
- research memo
- digest note
- patch proposal
- topic proposal

关键原则：

- 回答不自动等于正式知识
- 正式知识应尽量以 Markdown artifact 形态沉淀

Layer 5 -> Layer 6 的最小协议是：

- answer
- artifact proposal
- user confirmation
- artifact write

而不是让模型文本直接等于写入动作。

## 9. Layer 7: Governance and Ops Layer

这一层负责让系统长期可控。

至少包括：

- context arbitration
- evidence lineage
- write permission model
- feedback capture
- quality metrics
- auditability
- rollback friendliness

## 10. 当前阶段的推荐重心

### 10.1 先打穿的层

- Layer 1 `Input Adapter`
- Layer 2 `Capture Pipeline`
- Layer 3 `Normalization`
- Layer 4 `Project / Corpus`
- Layer 5 `Grounded Ask / Research`
- Layer 6 `Markdown Artifact`

### 10.2 作为增强层同步建设的

- recent digest
- recent thread
- resurfacing

### 10.3 暂不作为主战场的

- 重编辑器能力
- 企业式 workspace automation
- 通用自动执行 agent

## 11. 一句结论

`Tino AI 2.0` 的能力分层不是“多加几个 AI 按钮”，而是：

> 从外部工作环境把材料接进来，统一为 Markdown 语料，再围绕 project / corpus 持续工作，并把结果沉淀成 Markdown artifact。
