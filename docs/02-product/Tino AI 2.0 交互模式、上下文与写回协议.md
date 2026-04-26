# Tino AI 2.0 交互模式、上下文与写回协议

> 日期：2026-04-26
> 角色：当前 `Tino AI` 的交互契约文档
> 状态：最新共识
> 说明：本文件冻结“从哪里唤起、当前到底是在查/研/产哪一种意图里工作、scope 怎么定义、结果如何写回和回流”

## 1. 这份文档解决什么问题

当前阶段 `Tino` 不做编辑器，但仍然要支持：

- 全局小窗
- 选中内容发起 AI
- 应用内 chat
- project / corpus 工作流
- recent digest / thread 传递

如果没有明确契约，系统很容易重新漂回：

- 空泛聊天
- 任意上下文污染
- 黑箱写回

## 2. 当前统一入口的三种意图合同

虽然入口统一，但当前阶段不能只靠一个隐式 chat 契约。

必须显式区分三种意图：

### 2.1 `查`

用户在查现有语料里有什么。

默认要求：

- 优先 grounded answer
- 优先引用和定位
- 少推断
- 不主动扩写

### 2.2 `研`

用户在围绕语料推进理解。

默认要求：

- 允许综合和比较
- 允许提出假设
- 明确区分哪些是证据、哪些是推断
- 仍然受当前 scope 约束

### 2.3 `产`

用户在把结果沉淀成 artifact。

默认要求：

- 产出 draft / summary / proposal / patch
- 明确输出目标
- 不无确认写回正式资产

### 2.4 默认规则

当前默认规则固定为：

- 如果用户没有明确说明，先按 `查` 处理
- 只有在问题明显是开放式推进任务，或用户显式切换时，才进入 `研`
- 只有在用户明确要生成结果时，才进入 `产`

### 2.5 运行时判定规则

当前阶段不允许把 `查 / 研 / 产` 的判断完全藏在 prompt 里模糊处理。

最小判定规则如下：

- 满足以下任一条件，优先判为 `查`：
  - 用户在问“有没有 / 在哪 / 说了什么 / 这一段在讲什么”
  - 用户在要求解释、定位、引用、基于现有材料总结
  - 用户没有明确要求新假设、新方案或新产出
- 满足以下任一条件，优先判为 `研`：
  - 用户在要求比较、推演、拆题、找缺口、形成判断
  - 用户在说“帮我想想 / 这个方向是不是成立 / 下一步怎么研究”
  - 用户的问题无法仅靠现有原文定位回答，必须综合多个 source 或 thread
- 满足以下任一条件，优先判为 `产`：
  - 用户明确要 draft、summary、memo、patch、章节改写、笔记草稿
  - 用户明确说“帮我写 / 帮我整理成 / 帮我保存成”

### 2.6 冲突与模糊时怎么处理

- 如果一个请求同时包含 `查` 和 `研`，先 `查`，再在证据基础上进入 `研`
- 如果一个请求同时包含 `研` 和 `产`，先 `研`，再给 `产` 出 proposal
- 如果错误判定会显著影响结果，先追问一句，而不是强猜

这条规则的核心是：

> 不允许系统在用户以为自己在“查”的时候，偷偷用“研”的协议回答。

### 2.7 用户感知规则

`查 / 研 / 产` 是系统合同，不应该变成用户每一轮都手动切换的负担。

当前阶段固定为：

- 默认由系统隐式判定
- 默认不把模式切换做成高频必选操作
- 只有在歧义会显著改变证据、scope 或写权限时，才追问用户

## 3. 入口面

### 3.1 Global Quick Window

从任意位置快速唤起。

默认定位：

- 统一 AI 入口
- 默认按 `查` 处理
- 可承接快问、快查、快记、基于当前剪贴板或选中内容发起的工作

### 3.2 Ask About Selection

用户在外部环境里选中一段内容后发起 AI。

默认定位：

- 默认按 `查` 处理
- 当前选中内容是最高优先级上下文

### 3.3 In-App Chat Workspace

应用内的长期对话入口。

默认定位：

- 围绕某个 project / corpus 持续推进
- 承接 `查 / 研 / 产` 与 digest 消费

### 3.4 Project / Corpus Surface

进入某个项目后，对该项目的材料、thread、digest 继续工作。

默认定位：

- 围绕该 project / corpus 做 grounded ask / research / distill

### 3.5 Digest / Thread Surface

系统展示 recent digest / thread 变化的入口。

默认定位：

- 优先进入 digest 消费和继续追问
- 用户可以从静默结果跳进追问、纠错、继续加工

## 4. Scope Contract

当前阶段如果不把 scope 说清楚，grounded 承诺就不成立。

### 4.1 默认 scope

默认总是先看：

- `当前 Project`

而不是默认跨所有 project 搜。

### 4.2 可用 scope 层级

系统当前至少支持这几种 scope：

1. `Single Selection / Single Source`
2. `Current Project`
3. `Current Project + Related Thread / Digest`
4. `All Projects`
5. `External Knowledge`

### 4.3 默认切换规则

- 用户没有明确说明时，默认 `Current Project`
- 用户基于选中内容发起时，默认 `Single Selection / Single Source`
- 只有用户显式扩 scope 时，才进入 `All Projects`
- 只有用户显式要求，或在 `研` 模式下明确同意时，才进入 `External Knowledge`

### 4.4 scope 不足时的处理规则

如果当前 scope 内找不到足够依据，默认处理顺序固定为：

1. 明确告诉用户“在当前 scope 内没有找到足够依据”
2. 允许系统自动扩到 `Current Project + Related Thread / Digest`
3. 再询问是否扩到 `All Projects`
4. 最后才允许进入 `External Knowledge`

关键原则：

- 不静默跨 project
- 不静默引入外部知识
- 不把模型先验伪装成 corpus 事实

### 4.5 `External Knowledge` 的确切含义

当前阶段的 `External Knowledge` 至少拆成两类：

1. `Model Prior`
2. `Network Retrieval`

固定规则：

- `查` 模式下，当前 scope 不足时先承认不足，不静默拿外部知识补齐
- `Model Prior` 只有在用户明确要开放讨论，或系统显式标注“这是语料外推断”时才能进入回答
- `Network Retrieval` 在当前阶段不能静默触发，必须由用户显式触发或明确同意
- 外部知识不能伪装成 corpus citation

### 4.6 UI 要求

当前 scope 必须尽量可见，不能让用户猜系统到底在引用什么。

## 5. 入口面与默认意图

### 5.1 Global Quick Window

- 默认意图：`查`
- 默认 scope：当前 project；如果没有 project，则是当前显式输入

### 5.2 Ask About Selection

- 默认意图：`查`
- 默认 scope：`Single Selection / Single Source`

### 5.3 In-App Chat Workspace

- 默认意图：沿用当前 session；若无 session，先从 `查` 开始
- 默认 scope：`Current Project`

### 5.4 Project / Corpus Surface

- 默认意图：`查` 或 `研`
- 默认 scope：`Current Project`

### 5.5 Digest / Thread Surface

- 默认意图：先消费 digest，再允许进入 `查` 或 `研`
- 默认 scope：`Current Project + Related Thread / Digest`

## 6. Session Contract

当前阶段不把 chat 定义为无限延展的开放线程。

每个 session 都应尽量有：

- 一个明确 project 归属
- 一个主要任务上下文
- 一个当前 scope

如果用户已经明显切到另一个项目、另一个任务或另一个 scope，系统应倾向于：

- 建议新建 session
- 或在当前 session 内显式切换上下文

而不是把一切都堆进同一条长线程。

## 7. 上下文栈协议

每次进入 `Tino AI`，都应按优先级理解上下文。

### 7.1 Level 1: Explicit User Intent

总是最高优先级：

- 当前消息
- 当前明确指令
- 当前显式提交的选中内容

### 7.2 Level 2: Local Working Context

在当前 surface 内有效：

- 当前 project
- 当前 corpus subset
- 当前 digest 卡片
- 当前 thread

### 7.3 Level 3: Retrieved Knowledge

根据任务召回：

- exact recall
- semantic recall
- thread recall

### 7.4 Level 4: Silent Knowledge

必要时引入：

- recent digest
- recent thread
- pending clue

### 7.5 Level 5: Focus Signal

可选引入：

- attention hint
- 当前研究目标

### 7.6 Level 6: Session State

当前对话短期上下文。

## 8. 上下文使用规则

### 8.1 明示优先于猜测

用户显式提交的内容比系统猜测的相关材料优先级更高。

### 8.2 当前项目优先于全库泛召回

在 `project / corpus` 场景，先围绕当前 project 工作，再扩展到全库。

### 8.3 剪贴板和选中内容可以只做临时上下文

不是所有显式输入都必须立即进入长期 corpus。

### 8.4 静默知识是增强层，不是强插层

`digest / thread / pending clue` 只有在明显相关时才引入。

## 9. 回答协议

回答应尽量区分三类内容：

- 原始事实或原文证据
- 系统归纳
- 当前推断

在 `查` 场景，应优先提供：

- 相关 source / corpus document / digest 来源
- 关键片段定位
- 为什么优先取用这些材料

在 `研` 场景，还应额外区分：

- 哪些是基于证据的综合
- 哪些是当前推断

## 10. Markdown 写回与 Feedback Contract

### 10.1 默认写回形态

进入正式资产前，应优先以这些形态出现：

- `draft`
- `summary`
- `research memo`
- `patch proposal`
- `note proposal`
- `digest note`

### 10.2 默认不做的事

在没有显式确认时，不应：

- 直接覆盖外部 Markdown 文档
- 假装自己是完整编辑器
- 直接把开放对话提升为长期知识

### 10.3 推荐写回路径

1. 用户发起问题或任务
2. AI 返回回答、草稿或 proposal
3. 用户确认保存目标
4. 系统生成 Markdown artifact
5. 必要时交由外部工具继续编辑

### 10.4 Artifact 触发规则

当前阶段触发 artifact 的方式只允许三种：

1. `用户显式触发`
   - 例如“帮我写成笔记 / 保存成摘要 / 生成 patch”
2. `系统建议触发`
   - 当结果已经形成稳定结构，且明显有复用价值时，系统可以建议保存
3. `digest promotion`
   - 静默 digest 或 thread 可以提出 artifact 候选，但不直接写入

### 10.5 Artifact 确认规则

无论哪一种触发方式，写入前都至少要确认：

- artifact 类型
- target project
- 是否新建还是更新既有 artifact

如果是更新既有 artifact，还要确认：

- 更新目标
- 写回方式是 patch、append 还是 replace proposal

### 10.6 Artifact Feedback

当前阶段即使不做编辑器，也必须考虑 artifact 的反馈回流。

最小合同应包括：

- 用户可以显式标记 `有用 / 不对 / 需要重写`
- Tino 生成并托管路径下的 artifact，后续外部修改应能被视为新的 revision signal
- 用户可以把外部修改后的结果重新导入或刷新为新的 source / corpus signal

关键边界：

> 我们不接管外部编辑过程，但要接住外部编辑结果。

### 10.7 Artifact Ownership

当前阶段至少区分两类 artifact：

1. `Tino-managed artifact`
2. `User-managed artifact`

前者可以记录路径、元数据和 revision 信号；后者只允许 `Tino` 提供导出、append proposal 或 patch proposal，不应静默覆盖原文件。

### 10.8 Versioning 与冲突规则

当前阶段固定两条保守规则：

1. 不自动 merge
2. 外部修改先作为 revision signal，而不是自动重写指令

如果同一 artifact 在外部和 `Tino` 侧都发生变化，系统默认应：

- 生成新的 revision 或 patch proposal
- 让用户决定 append、replace 还是手动合并

## 11. 一句结论

`Tino AI 2.0` 的真正交互契约不是“打开聊天框”，而是：

> 在正确的入口上，明确当前是在 `查 / 研 / 产` 哪一种意图里工作，带着正确的 project / corpus scope，并把结果沉淀和回流为可继续使用的 Markdown artifact。
