# Tino AI Runtime 与 Agent 工程方案 v0.1

> 日期：2026-04-06
> 适用阶段：`M5 AI Pipeline` 启动前
> 关联文档：
> - `docs/02-product/个人信息流软件需求原型文档.md`
> - `docs/02-product/Tino AI 能力地图 v0.2.md`
> - `docs/03-planning/技术冻结记录.md`
> - `docs/03-planning/HANDOFF.md`

## 1. 文档目的

这份文档不是产品愿景文档，而是 `Tino` 在进入 AI 开发阶段之后的技术执行基线。

它主要解决五个问题：

- `Tino` 的 AI 能力在工程上应拆成哪几层
- `接入模型` 与 `Agent runtime` 的边界分别是什么
- 哪些职责放在 `Renderer`，哪些职责必须继续放在 `Rust`
- 后续开发应该按什么顺序推进，避免跳步
- 哪些状态、schema、工具边界需要先冻结，后面的实现才能稳定

这份文档默认不推翻现有冻结约束。
如果它与 [技术冻结记录](/Users/louistation/MySpace/Life/tino/docs/03-planning/技术冻结记录.md) 冲突，以冻结记录为准，并显式更新两边。

## 2. 一句总判断

`Tino` 的 AI 工程，不应先理解为“做一个大 Agent”，而应先理解为：

> 一个建立在真实批次、受控上下文、结构化输出、静默后台编译、隐藏干预和 Rust 副作用边界之上的 AI runtime。

短期先做的是 `可控工作流`，不是 `高自治体`。
先证明 AI 值得信任，再考虑更强的 agentic 能力。
MVP 的产品语义也要保持清楚：

- 用户心智是 `inbox-first`
- 用户不先创建 `topic`
- runtime 的任务是从混杂输入里做聚类、归并和议题建议，然后交给程序持久化

## 3. 不允许偏离的前提

以下前提已经在现有文档里基本冻结，这份方案只负责把它们工程化：

- AI 不是首发聊天产品，当前主链路是 `批量处理`
- `daily/` 与 AI 提炼必须双轨隔离
- `topic` 是后台生成结果，不是用户前置输入
- AI 只输出结构化决策，不直接控制真实文件路径
- AI 调用层在 `Renderer`
- Agent runtime / prompt 编排在 `Renderer`
- 文件写入和真实副作用仍由 `Rust command` 执行
- 批次触发仍遵循当前 `20 条` 或 `10 分钟` 的规则
- 主窗口中的 AI 用户价值核心不是聊天，也不是批次审阅本身，而是结果交付与异常兜底

## 4. 先分清两件事

### 4.1 LLM 接入层

这是“让系统能够真实调用外部模型”的部分。  
它解决的是：

- provider 配置
- model 选择
- API 调用
- 超时与重试
- 结构化结果生成

如果这层没打通，后面的 AI 能力都只能停留在 mock。

### 4.2 Agent Runtime 层

这是“让模型调用变成稳定工作流”的部分。  
它解决的是：

- 批次状态机
- 上下文装配
- prompt 组织
- schema 校验
- 异常干预与校准
- 反馈记录
- 持久化编排
- 可观测性与回放

没有这一层，哪怕模型能调通，也只是“一次 API 调用”，还不是一个可维护的系统。

### 4.3 当前阶段的正确关系

正确顺序不是：

1. 先做一堆 Agent 想象
2. 最后再去接模型

也不是：

1. 先把模型接通
2. 不做 schema、不做 review、不做状态机，直接落盘

正确做法是：

1. 先定义契约和工作流边界
2. 再打通最小 LLM 链路
3. 再把真实模型接入到已定义好的 runtime 里

## 5. 技术分层

建议把后续 AI 开发按下面六层理解。

## 5.1 Layer A: Provider Access Layer

职责：只负责把外部模型接进来。

位置：`Renderer`

建议职责：

- 读取 AI Provider 配置
- 基于 `Vercel AI SDK Core` 创建模型客户端
- 通过 `@ai-sdk/openai` 适配 OpenAI / OpenAI-compatible `Responses API`
- 统一处理超时、网络错误、认证失败、空响应等基础错误
- 提供 `generateObject` 这类结构化调用入口

不应负责：

- 拼接长期上下文
- 文件写入
- 业务状态流转
- topic 路径决定

这是 `模型访问层`，不是 `业务层`。

## 5.2 Layer B: AI Runtime Layer

职责：管理一个批次从“待处理”到“形成候选结果并落盘”的完整状态流。

位置：`Renderer`

建议职责：

- 轮询或读取 ready batch
- 组装 AI 输入
- 调用模型
- 校验结构化输出
- 生成候选结果与异常标记
- 在需要时进入隐藏干预流程
- 处理人工反馈
- 驱动持久化命令
- 更新运行态与错误态

这层是整个 AI 主链路的核心。

## 5.3 Layer C: Context Assembly Layer

职责：控制模型真正看到什么。

位置：`Renderer`

建议输入：

- 当前 batch 内容
- Top N 相关 topic index
- 用户显式偏好
- 可能的批次元信息，例如时间窗口、capture summary

明确禁止：

- 直接把完整 `daily/` 喂给模型
- 无限量注入全部 topic 全文
- 把任意本地文件路径开放给模型

`Tino` 的上下文工程，核心不是“喂得越多越好”，而是“喂得越受控越稳定”。

## 5.4 Layer D: Workflow / Agent Layer

职责：定义“有哪些 AI 工作流”。

当前阶段建议只做专用工作流，不做通用超级 Agent。

建议的工作流拆分：

- `BatchDecisionWorkflow`
  负责对一个 ready batch 做聚类、归并、议题建议、摘要、置信度判断
- `ReviewFeedbackWorkflow`
  负责把用户的接受、改派、打回行为记录为反馈资产
- `TopicMaintenanceWorkflow`
  中期再做，负责 topic 合并、拆分、重命名建议

短期不做：

- 通用聊天 Agent
- 任意工具调用型通用 Agent
- 陪伴型 Agent runtime

## 5.5 Layer E: Tool Boundary Layer

职责：把 AI 与真实系统副作用隔开。

位置：

- 调用入口在 `Renderer`
- 实际副作用由 `Rust command` 执行

建议 Rust 工具职责：

- 读取 ready batch 列表与批次详情
- 读取 topic index 摘要
- 持久化 AI 审阅结果
- 写入 `topics/` / `_inbox/`
- 更新 batch 状态
- 记录 review feedback
- 刷新 topic index

原则：

- AI 只能给出结构化建议
- 路径、文件名、最终写入格式都由程序控制
- 重试、幂等、状态落盘必须可审计

## 5.6 Layer F: Intervention / Observability Layer

职责：让 AI 行为可见、可纠正、可回放。

位置：`Renderer + Rust`

至少要能回答：

- 这批内容为什么被归到这里
- 置信度是多少
- 用了哪些上下文
- schema 是否通过
- 用户最后改了什么
- 最终写入去了哪里

没有这层，就没有真正的“Agent 工程化”。

## 6. 当前阶段的最小工作流

在 `M5` 启动时，建议只跑下面这条最小闭环：

1. `Rust` 已产出 ready batch
2. `Renderer` 读取 batch 详情
3. `Renderer` 组装上下文
4. `Renderer` 通过 `Vercel AI SDK` 调模型并拿结构化结果
5. `Renderer` 做 schema 校验
6. `Renderer` 形成候选结果，判断是直接落盘还是进入隐藏干预层
7. `Rust` 写入 `topics/` 或 `_inbox/`
8. 如遇低置信度、冲突或显式抽检，再进入干预流程
9. `Renderer` 将最终结果或干预结果交给 `Rust command`
10. `Rust` 更新 batch 状态、topic index、runtime

这条链路是后续一切 AI 能力的根。

## 7. 核心状态机

建议把批次处理拆成明确状态，而不是“跑完就完”。

### 7.1 Batch Runtime State

建议状态：

- `ready`
- `running`
- `schema_failed`
- `review_pending`
- `reviewed`
- `persisting`
- `persisted`
- `failed`

含义：

- `ready`：Rust 已生成待 AI 处理批次
- `running`：Renderer 正在执行模型调用
- `schema_failed`：模型返回了无效结构
- `review_pending`：已生成可审阅结果，等待用户动作
- `reviewed`：用户已完成审阅，等待落盘
- `persisting`：Rust 正在执行真实写入
- `persisted`：最终结果已落地
- `failed`：超过重试上限或遇到不可恢复错误

说明：

- 当前命名里的 `review_*` 主要是阶段性实现术语
- 在产品语义上，应理解为隐藏干预 checkpoint，而不是普通用户的主流程状态

### 7.2 Review Action

审阅动作建议固定为：

- `accept_all`
- `accept_with_edits`
- `reroute_to_inbox`
- `reroute_topic`
- `discard`

其中 `discard` 只影响 AI 输出，不影响原始 `daily` 归档。

### 7.3 失败原则

- 网络失败：允许重试
- schema 校验失败：纳入同一套重试策略
- Rust 持久化失败：必须可恢复，不允许 silent fail
- 任一步失败都不能影响 `daily` 原始归档

## 8. 核心 schema 与契约

这里分两类 schema。

### 8.1 IPC DTO

凡是跨 `Rust <-> Renderer` 边界的类型，必须遵守当前仓库规则：

1. 先定义在 `Rust`
2. derive `specta::Type`
3. Tauri command 标注 `#[specta::specta]`
4. 注册到 `src-tauri/src/ipc_schema.rs`
5. 运行 `pnpm gen:bindings`
6. Renderer 再消费生成后的 bindings

这类类型至少会包括：

- `AiBatchSummary`
- `AiBatchPayload`
- `TopicIndexEntry`
- `BatchDecisionReview`
- `ApplyBatchDecisionRequest`
- `ApplyBatchDecisionResult`
- `ReviewFeedbackRecord`

命名可以调整，但职责不要漂移。

### 8.2 Model-facing Schema

模型直接输出的结构建议由 `Renderer` 侧 schema 工具约束，例如 `zod`。
但只要这份结构最后要交给 `Rust` 落盘，它对应的持久化 DTO 仍然应有 `Rust` 源头。

换句话说：

- 模型输出校验：可以先在 `Renderer` 完成
- 进入系统正式持久化的数据结构：必须有 `Rust` 契约

### 8.3 第一版最小输出结构

第一版输出的重点不是给用户一个必须立即接受的最终 `topic`，而是给程序一份可持久化的聚类结果和议题建议。

建议第一版结构至少包含：

- `clusters`
- `source_ids`
- `decision`
- `topic_slug_suggestion`
- `topic_name_suggestion`
- `title`
- `summary`
- `key_points`
- `tags`
- `confidence`
- `reason`
- `possible_topics`
- `missing_context`

其中：

- `topic_slug_suggestion` 只是建议，不是最终路径
- `possible_topics` 和 `missing_context` 主要服务低置信度解释

## 9. 代码组织建议

为了后续维护，建议在现有结构下逐步形成下面的模块边界。

### 9.1 Renderer

建议新增或收敛到：

```text
src/features/ai/
  components/
  hooks/
  lib/
  runtime/
  schemas/
  stores/
```

职责建议：

- `runtime/`：批次状态机、workflow runner、重试策略
- `schemas/`：模型输出 schema、prompt 输入 schema
- `lib/`：provider client、context builder、prompt builder
- `components/`：隐藏干预面板、调试视图
- `stores/`：review state、batch selection、反馈草稿

### 9.2 Rust

建议新增或收敛到：

```text
src-tauri/src/commands/
  ai.rs
```

或在现有 shell 命令基础上拆出独立 AI 命令模块。

职责建议：

- 提供 ready batch / batch detail / topic index 读取命令
- 提供 batch result apply 命令
- 提供 review feedback persist 命令
- 提供 topic index refresh 命令

## 10. 实施顺序

以下顺序是本方案最核心的部分。
后续开发时不要跳。

## 10.1 Phase 0: 输入侧收紧与可见性补足

目标：不给后面的 AI 喂垃圾输入。

继续完成当前已在 `HANDOFF` 中明确的事项：

- 剪贴板体验打磨
- 暂停 / 恢复采集语义落地
- 最近队列 / 最近批次可见性补足
- 富文本保真度与噪音处理继续收敛

这一步不属于 AI runtime，但它是 AI 开始前的必要前置。

## 10.2 Phase 1: Contract First

目标：先把 AI 主链路的契约和边界写清楚。

任务：

- 定义首批 Rust IPC DTO
- 定义模型输出 schema
- 定义 batch runtime 状态机
- 定义 review action 结构
- 产出一批 mock batch fixture
- 用 mock 数据先搭好隐藏干预面板

完成标准：

- 即使没有模型，也能在 UI 中完整跑一遍隐藏干预与调试流程

## 10.3 Phase 2: 打通最小 LLM 链路

目标：让系统真实调用模型，但只做最小闭环。

任务：

- 接入 `Vercel AI SDK Core`
- 接入 `@ai-sdk/openai`
- 打通 provider config -> model client -> `generateObject`
- 建立统一错误分类
- 实现单批次手动触发运行
- 把结构化结果送入候选结果与干预流程

完成标准：

- 单个 ready batch 可以产出真实结构化结果
- schema 无效时能明确失败，不 silent pass

## 10.4 Phase 3: Intervention & Calibration

目标：建立异常兜底与校准回路，而不是把审阅做成主产品路径。

任务：

- 隐藏干预面板接入真实 batch
- 支持接受、改派、打回 `_inbox`
- 记录 review feedback
- 在调试视图展示本次 AI 输入摘要、输出摘要和动作历史

完成标准：

- 开发者或高级用户可以基于真实 AI 结果完成一次干预并提交

## 10.5 Phase 4: Programmatic Persistence

目标：把最终结果稳定落入知识层。

任务：

- Rust 接收最终结果
- 程序控制 topic 路径和文件名
- 写入 `topics/` / `_inbox/`
- 更新 batch 状态与 topic index
- 保证幂等和失败恢复

完成标准：

- 从 ready batch 到 `topics/` / `_inbox/` 的真实 AI 闭环打通

## 10.6 Phase 5: Feedback Learning

目标：让系统开始利用人的反馈，而不是每次都从零开始。

任务：

- 将 review 行为沉淀为反馈记录
- 统计接受率、改派率、inbox 率
- 将显式偏好接入 context builder
- 为后续 topic maintenance 提供基础素材

完成标准：

- 系统可以开始用反馈影响后续批次决策

## 10.7 Phase 6: Topic Maintenance 与中期能力

目标：从“批次能处理”走向“知识层能维护”。

任务：

- topic 合并 / 拆分 / 重命名建议
- topic index 刷新策略优化
- 周期性回顾
- 历史补跑与重编译

这一步之后，再考虑更强的主动能力才合理。

## 11. 当前阶段明确不做的事

为了避免注意力漂移，以下能力不进入当前执行主链路：

- 聊天窗口优先化
- 通用工具调用 Agent
- 大规模长期记忆注入
- 陪伴角色 UI
- 电子宠物交互系统
- 主动型强干预提醒系统

这些都属于后续建立在稳定 runtime 之上的上层体验，不是当前的基础设施。

## 12. 第一阶段成功标准

AI 工程第一阶段成功，不以“模型很聪明”为标准，而以这三件事为准：

1. 一个 ready batch 能稳定产出结构化结果
2. 系统能默认静默完成大部分批次，不要求用户逐批操作
3. 低置信度或异常结果能进入隐藏干预层，最终仍能被程序稳定落到 `topics/` / `_inbox/`

如果这三件事没闭环，后续所有 Agent 想象都不应继续外扩。

## 13. 维护规则

从这份文档开始，后续 AI 相关开发遵循下面的同步规则：

- 如果 `技术分层` 变化，必须同步更新本文件和 `技术冻结记录`
- 如果 `实施顺序` 变化，必须同步更新本文件和 `HANDOFF`
- 如果新增关键 schema / 命令边界，必须同步更新本文件和 `MVP开发任务拆解`
- 如果产品层 AI 目标变化，优先更新 `Tino AI 能力地图`

## 14. 最终结论

`Tino` 的 AI 开发，短期不应该理解为“接一个模型然后做很多功能”，而应该理解为：

> 先建立一套可控、可审计、默认静默运行、必要时才进入隐藏干预的 AI runtime，再在这套 runtime 上逐步长出更强的 Agent 能力。

模型接入是前提，但不是全部。
Agent 工程化不是“更自由”，而是“更稳定、更有边界、更能持续维护”。

后续只要进入 AI 开发阶段，应默认以本文作为技术执行主基线。
