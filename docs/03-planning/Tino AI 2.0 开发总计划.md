# Tino AI 2.0 开发总计划

> 日期：2026-04-26
> 角色：当前唯一持续维护的任务状态跟踪文档
> 状态：active
> 说明：本文件只回答“现在做到哪了、下一步做什么、什么先不做”；它不替代 `HANDOFF`、`技术冻结记录`、产品定义或架构基线

## 1. 使用方式

开始一个新任务时，默认先读：

1. `AGENTS.md`
2. `docs/03-planning/HANDOFF.md`
3. `docs/03-planning/技术冻结记录.md`
4. `docs/03-planning/Tino AI 2.0 开发总计划.md`

然后再按任务需要进入：

- `docs/02-product/Tino AI 2.0 文档索引.md`
- `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
- 其他专项方案

维护规则：

- 任务状态、优先级、阶段顺序变化时更新本文件
- 架构边界变化时更新 `技术冻结记录`
- 当前真实代码状态变化时更新 `HANDOFF`
- 产品母型或运行时合同变化时更新 `docs/02-product/Tino AI 2.0 文档索引.md`

## 2. 当前阶段唯一目标

当前阶段不是做编辑器，不是做开放式闲聊，也不是做高自治 agent。

当前唯一目标是打穿这条主循环：

> `Import / Capture -> Normalize -> Route to Project -> Grounded Ask / Research -> Draft / Distill -> Save as Markdown Artifact -> Re-enter Project`

也就是把 `Tino` 做成一个可持续推进 project 的 `project / corpus copilot`。

## 3. 已完成的前置收口

以下内容已基本成立，不应再反复回到方向争论：

- 输入捕获与原始归档链路已跑通
- `HomeChatWorkspace` 已具备多会话的交互式入口基础
- provider-backed background compile 主链路已接上
- `backgroundCompileWriteMode = sandbox_only` 已把旧的小 batch 直写主语义降级
- `Tino AI 2.0` 产品定义、主战场、交互合同、运行时护栏已落盘

## 4. 当前任务面

### P0. 2.0 文档与合同收口

状态：`completed`

目标：

- 产品母型、主战场、输入边界、交互合同、运行时护栏全部落盘

退出条件：

- 新接手的人不需要读历史文档，也能知道当前产品和架构共识

### P1. 静默编译语义上移

状态：`in_progress`

目标：

- 把当前 background compiler 从“小 batch 直接落库”继续收束到 `triage -> day digest -> rolling topic -> final write`

当前关注：

- `day digest / rolling topic` contract
- 用户可感知的静默输出入口
- 不让旧语义继续污染正式知识层

退出条件：

- 小 batch 只承担调度和 triage
- 日级与跨日收敛层成为真正语义层

参考文档：

- `docs/03-planning/Tino AI 静默编译与显式意图执行方案 v0.1.md`
- `docs/03-planning/Tino AI 静默编译优化与迁移方案 v0.1.md`

### P2. Project / Corpus 运行时骨架

状态：`next`

目标：

- 把 `project / corpus` 从产品定义真正接到运行时

当前关注：

- `source / capture -> project` routing
- `Inbox Project` 的缓冲层语义
- 当前 project 绑定
- session 与 project 的关系

退出条件：

- 每个输入都有明确 project 归属或明确落到 `Inbox Project`
- 交互式入口能看见当前 project scope

参考文档：

- `docs/02-product/Tino AI 2.0 核心对象与主循环.md`
- `docs/02-product/Tino AI 2.0 输入通道与 Capture 体系.md`
- `docs/02-product/Tino AI 2.0 运行时护栏.md`

### P3. `查 / 研 / 产` 与 scope 运行时落地

状态：`next`

目标：

- 把 `查 / 研 / 产`、scope escalation、external knowledge guard 落到真实交互逻辑

当前关注：

- 意图判定
- scope 可见性
- `Current Project -> Related Thread / Digest -> All Projects -> External Knowledge` 的升级顺序

退出条件：

- 系统不再静默跨 project
- 系统不再静默把外部知识伪装成 corpus facts
- 用户能感知当前 scope

参考文档：

- `docs/02-product/Tino AI 2.0 交互模式、上下文与写回协议.md`
- `docs/02-product/Tino AI 2.0 运行时护栏.md`

### P4. Artifact 闭环

状态：`next`

目标：

- 把回答和正式 artifact 分开，并打通保存、更新、回流

当前关注：

- artifact proposal
- new vs update
- `Tino-managed` vs `User-managed`
- no auto-merge

退出条件：

- 回答不会直接等于写入动作
- artifact 更新前有明确确认
- 外部修改能回流为 revision signal

参考文档：

- `docs/02-product/Tino AI 2.0 交互模式、上下文与写回协议.md`
- `docs/02-product/Tino AI 2.0 运行时护栏.md`

### P5. Feedback / Quality / AI Ops

状态：`in_progress`

目标：

- 让 feedback memory、offline replay、quality snapshot 和 AI Ops 成为持续改进底座

当前关注：

- 用户纠错入口
- feedback event 落库
- replay / scoring
- AI Ops 可观测面

退出条件：

- 能回答“这次改动有没有让系统更好”
- 能回答“哪些错误来自召回、模型、路由还是写入”

参考文档：

- `docs/03-planning/Tino AI 开发期质量管线计划 v0.1.md`
- `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`

### P6. 输入适配器扩展

状态：`later`

目标：

- 在主循环稳定后，继续把文件导入、链接导入、选中内容、更多系统级入口接入统一 input adapter

约束：

- 不另起新的 AI 孤岛
- 不先做复杂编辑器

## 5. 当前推荐顺序

默认按下面顺序推进：

1. 继续完成 `P1`，把静默编译语义层真正上移
2. 再做 `P2`，把 `project / corpus` 对象接到运行时
3. 然后做 `P3`，让交互式入口具备稳定的意图与 scope 合同
4. 再做 `P4`，把 artifact 闭环接上
5. 同步推进 `P5`，避免没有质量闭环就继续扩行为
6. 最后再扩 `P6`

## 6. 当前明确不进入主计划的方向

以下内容当前不进入主计划：

- 重编辑器能力
- 无限延展的闲聊线程
- 高自治外部工具执行 agent
- 重陪伴型人格产品
- 为单一垂直场景先做重专用系统

## 7. 一句结论

如果后续有人重新接手开发，默认不要从历史文档和散落专项计划开始，而是从这份总计划进入：

> 先看当前阶段唯一目标是什么，再看当前做到哪了、下一步优先级是什么，最后才按任务进入专项文档。
