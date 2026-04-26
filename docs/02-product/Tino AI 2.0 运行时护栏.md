# Tino AI 2.0 运行时护栏

> 日期：2026-04-26
> 角色：冻结当前阶段几个最容易做歪的运行时判断
> 状态：最新共识

## 1. 这份文档解决什么问题

前面的 2.0 文档已经定义了：

- `Tino AI` 是什么
- 当前主战场是什么
- 核心对象是什么
- `查 / 研 / 产`、scope、artifact 写回怎么理解

但这还不够。

真正容易把实现带歪的，往往不是“方向错了”，而是这些运行时问题没有被写死：

- `local-first` 到底是数据面，还是计算面
- `Inbox Project` 怎么防止变成垃圾场
- 静默系统什么时候该出现，什么时候不该打扰
- 外部知识到底指什么，能不能静默混进 grounded answer
- artifact 的托管权、版本和冲突怎么处理
- `查 / 研 / 产` 要不要让用户每一轮都手动切

这份文档只负责冻结这些护栏。

## 2. Guardrail 1：`local-first` 先指数据面和工作流面

当前阶段的 `local-first`，首先指的是：

- 本地材料优先
- 本地 project / corpus 边界优先
- 本地 artifact 所有权优先
- 用户自己的工具链优先

它当前不默认等于：

- 必须全程本地模型推理
- 必须完全离线

Phase 2.0 允许存在显式的云端推理能力，但要满足：

- provider 是显式配置的
- 网络外发是可预期的，不隐藏在产品叙事里
- 外发前有最小本地敏感信息守门
- 结果不被静默写进第三方云 workspace 作为唯一真相源

结论：

> 当前阶段 `local-first` 的真义是 `local-first data plane + workflow plane`，不是“先承诺本地算力一切就绪”。

## 3. Guardrail 2：`查 / 研 / 产` 默认隐式判定，不让用户频繁切模式

`查 / 研 / 产` 是系统契约，不应该变成每轮都要用户手动操作的 UI 负担。

当前固定规则是：

- 默认由系统隐式判定
- 默认先按 `查`
- 只有在歧义会显著改变结果时，才追问一句
- 只要涉及外部知识扩 scope 或 artifact 写回，就必须让用户可感知

也就是说：

> 三态要成为系统内部的稳定合同，而不是用户每轮都要操作的复杂开关。

## 4. Guardrail 3：`Inbox Project` 是接住未分配输入的缓冲层，不是长期垃圾场

`Inbox Project` 的职责是：

- 接住没有明确 project 归属的输入
- 给默认收藏型用户一个低摩擦入口
- 承载初步 digest、归类建议和 resurfacing

它的职责不是：

- 永远堆所有杂项
- 自动等于正式知识层
- 持续把低质量噪音反复推给用户

当前最小治理规则固定为：

1. 未显式归属的输入默认进入 `Inbox Project`
2. 系统可以建议归类到具体 project，但不能静默挪动已命名 project 的材料
3. 长期未被引用、未被确认、未被提升的 capture，不应持续高频 resurfacing
4. `Inbox Project` 的 digest 和 resurfacing 应比活跃 project 更保守
5. 低置信输入允许停留在 capture / inbox 候选层，不急于提升成 corpus 或 artifact

结论：

> `Inbox Project` 是系统的缓冲和整理层，不是默认知识真相层。

## 5. Guardrail 4：静默系统必须遵守不打扰原则

静默系统是增强层，但它不能通过频繁打断来证明自己存在。

当前阶段固定原则是：

- 默认优先在相关 project 内、首页摘要区、digest / thread surface 中出现
- 不做高频条目级提醒
- 弱信号优先 pull-based，让用户在进入相关上下文时看到
- 高置信建议也应优先以 digest / summary 形式出现，而不是外部弹窗打断

初期产品边界进一步固定为：

- 主动输出以日级或阶段级汇总为主
- 不把“每来一条 capture 就提醒一次”当成设计方向

结论：

> 静默系统的成功，不是让用户更常被打断，而是让用户在重新进入工作时更快接上脉络。

## 6. Guardrail 5：`External Knowledge` 必须拆清楚

当前阶段的 `External Knowledge` 不能含糊。

它至少分成两类：

1. `Model Prior`
2. `Network Retrieval`

当前固定规则是：

- 在 `查` 模式下，如果当前 corpus scope 不足，先承认不足，不静默拿外部知识补齐
- `Model Prior` 只有在用户明确要开放讨论，或系统明确标注“这是语料外推断”时才能进入回答
- `Network Retrieval` 在 Phase 2.0 不允许静默触发，必须显式触发或得到明确同意
- 外部知识永远不能伪装成 corpus 引用

结论：

> `External Knowledge` 可以存在，但必须被看见、被区分、被单独承担风险。

## 7. Guardrail 6：artifact 必须先分清托管权，再谈更新和回流

当前阶段的 artifact 至少分成两类：

### 7.1 `Tino-managed artifact`

特点：

- 由 `Tino` 生成并登记其路径和元数据
- 可以跟踪 revision
- 可以接住外部修改后的回流信号

### 7.2 `User-managed artifact`

特点：

- 文件主导权在外部工具和用户手里
- `Tino` 可以导出结果、给 patch proposal、给 append proposal
- `Tino` 不应静默覆盖原文件

进一步固定两个规则：

1. 不自动 merge
   - 如果同一 artifact 在外部和 `Tino` 侧都发生变化，默认进入 `revision / patch proposal`，交给用户确认
2. 外部修改先作为 signal，而不是自动回写指令
   - 外部编辑结果应先影响后续理解和建议，不应直接重写既有知识层

结论：

> 开放 artifact 闭环成立的前提，不是自动写得更激进，而是写权限和版本冲突都更保守。

## 8. 一句结论

`Tino AI 2.0` 当前最重要的运行时护栏是：

> `local-first` 先约束数据面和工作流面，`Inbox Project` 不变垃圾场，静默系统不靠打扰证明存在，外部知识不静默混入 grounded answer，artifact 不在托管权和版本不清时自动写回。
