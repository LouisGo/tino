# Tino AI 2.0 产品定义

> 日期：2026-04-26
> 角色：当前 `Tino AI` 产品层的唯一主定义
> 状态：最新共识
> 适用范围：AI 入口、project / corpus 工作台、grounded chat、research、silent digest、Markdown 产出
> 取代：
> - `docs/02-product/Tino AI 能力地图 v0.2.md`
> - `docs/02-product/个人信息流软件需求原型文档.md` 中与 AI 入口、AI chat、AI 主产品心智相关的口径

## 1. 这份文档解决什么问题

这份文档用于结束当前仓库中以下几种容易漂移的模糊状态：

- `Tino AI` 到底更像 `Notion AI` 还是 `NotebookLM`
- `Tino` 到底要不要做编辑器
- AI 到底是在围绕“知识库”、围绕“聊天”，还是围绕“项目语料”工作
- 静默系统、剪贴板、Markdown 资产、chat 入口之间到底是什么关系

本文的目标，是把当前阶段真正该做的产品母型和主战场定清楚。

## 2. 产品母型

当前共识不是把 `Tino AI` 做成纯 `Notion AI`，也不是把它做成纯 `NotebookLM`。

更准确的母型是：

> `Tino AI = NotebookLM` 式的 `project / corpus AI` 内核 + `Notion AI` 式的统一入口体验。

这里的重点是：

- 内核站在 `NotebookLM` 一侧：围绕一批用户提供的材料持续工作
- 入口体验借鉴 `Notion AI`：统一唤起、统一提问、统一承接多类任务
- 但 `Tino` 不承接 `Notion` 那种完整编辑器 / workspace 管理职责

## 3. 一句话定义

`Tino AI` 是一个 `Markdown-first` 的个人项目语料 AI 工作台：

> 用户把 Markdown 或其他任意材料丢进来，系统将其归一成可追溯的 Markdown 语料，再围绕这些语料提供 grounded chat、research、silent digest 和 Markdown 产出。

## 4. 当前主战场

### 4.1 单一主战场

当前最该聚焦的不是“万能 AI”，而是：

> 让用户能围绕一批自己的材料，稳定地问、找、想、改、写，并把结果落回 Markdown。

这意味着当前 `Tino AI` 的真正主战场是：

> `Project Corpus Copilot`

也就是围绕一个项目或一组语料持续工作的 AI 工作台。

### 4.2 为什么这样收口

你当前关心的几个场景，本质上都能收编到这条主线上：

- 长篇小说创作：围绕作品 corpus 持续对话、改写、补设定
- 某个研究议题：围绕资料 corpus 检索、总结、研究
- 随手收藏 / 剪贴板沉淀：围绕默认 inbox corpus 做静默整理和 resurfacing

因此，当前正确的抽象不是“做三个产品”，而是：

> 做一个以 `project / corpus` 为核心的产品，再让创作、研究、收藏成为不同模板。

## 5. 当前主用户心智

当前阶段 `Tino AI` 的核心用户心智，不是“坐下来聊天”，而是：

> “我在推进一个 project。”

这意味着：

- `task-driven` 是主心智
- `query-driven` 是推进项目时最常见的子动作
- `exploration-driven` 是增强模式，不是默认主心智

因此，当前 chat 不应被理解为开放式闲聊入口，而应被理解为：

> 推进 project 的统一操作面

## 6. 当前默认行为

虽然入口统一，但系统默认行为必须保守。

当前默认口径是：

- 默认先按 `查` 处理
- 只有用户明确在“研究”或“产出”时，才进入更开放的工作协议
- 默认 scope 先收敛在 `当前 Project`

这样做的原因是：

- 用户最容易把系统回答理解成 grounded answer
- 如果系统在用户以为自己在“查”的时候偷偷进入“想”或“写”，信任会很快崩掉

## 7. 我们做什么

`Tino AI` 当前应明确承接以下职责：

1. 接住来自外部世界的材料输入
2. 将材料归一成可追溯的 Markdown 语料层
3. 围绕语料做 grounded chat、检索、研究、改写、总结
4. 通过轻量静默 digest / thread / resurfacing 帮用户看见值得继续处理的东西
5. 产出新的 Markdown 资产，例如 draft、summary、note、patch proposal、digest

## 8. 我们不做什么

`Tino AI` 当前明确不承接以下职责：

1. 不做复杂 Markdown 编辑器
2. 不做 `Notion / Obsidian / 思源 / VSCode` 的替代品
3. 不做完整的文档 authoring 工作台
4. 不做通用高自治工具执行 Agent
5. 不做陪伴型人格产品
6. 不做一上来就很重的全自动知识自治系统

这条边界要特别清楚：

> 我们不是在做“管理 Markdown 的编辑器”，而是在做“围绕 Markdown 语料工作的 AI 层”。

## 9. Markdown-first 的真正含义

`Markdown-first` 在这里不是说：

> 用户必须用 `Tino` 来写 Markdown。

而是说：

> `Tino` 以 Markdown 作为统一 AI 语料层和正式产出层。

也就是说：

- 用户可以在外部工具里写和改 Markdown
- 用户也可以导入 PDF、PPT、Excel、网页、图片、视频等任意材料
- `Tino` 负责把这些材料统一转换或映射到可追溯的 Markdown 语料层
- AI 主要围绕这层语料工作
- 正式 AI 产出也优先落成 Markdown 资产

## 10. 核心承诺

`Tino AI` 当前阶段的核心承诺是：

1. 我可以作为统一入口承接围绕项目语料的问、找、想、改、写
2. 我尽量基于你给我的材料回答，而不是脱离语料自由发挥
3. 我会把来源、证据、形成路径尽量讲清楚
4. 我会把有价值的结果变成可复用的 Markdown 资产，而不是停留在一次性对话里
5. 我会通过轻量静默整理，把值得回看、值得继续推进的 thread / digest 带回给你

## 11. 非承诺

`Tino AI` 当前不承诺：

1. 永远像人一样“记得你”
2. 在没有证据时也给出流畅确定的答案
3. 无确认地改写正式知识资产
4. 接管用户全部写作和知识管理流程
5. 一上来就服务所有垂直场景的深层专用逻辑

## 12. 静默系统的正确位置

静默系统依然很重要，但当前不应喧宾夺主。

正确理解是：

- 当前产品主线是 `project / corpus copilot`
- 静默系统是它的增强层
- 静默系统应先聚焦：
  - recent digest
  - recent thread
  - resurfacing
  - pending clue

而不是先把自己做成另一条更重的自动知识主脑产品线。

## 13. 剪贴板的正确位置

剪贴板不是边缘功能，也不是知识真相源。

它的正确定位是：

> `Tino` 与外部工作环境之间的高频输入总线。

也就是：

- 它是第一等 `input adapter`
- 它进入 `capture pipeline`
- 它提供高频被动采集、显式送入项目、临时上下文桥接三种价值
- 但它本身不等于 corpus，也不等于正式知识资产

## 14. 当前阶段的成功标准

如果 2.0 方向成立，用户应逐步形成以下感知：

- “我可以把一批材料丢进来，然后围绕它们持续工作”
- “它回答问题时是贴着我自己的语料，而不是空泛聊天”
- “我不需要在 `Tino` 里写文档，但我能在这里把材料变成更好的 Markdown 结果”
- “它能把最近值得我回看的线索重新带回来”
- “它不会抢编辑器的活，但会把知识工作推进得更快”

## 15. 一句结论

当前阶段对 `Tino AI` 最准确的定义是：

> 一个 `NotebookLM` 式的个人项目语料 AI 工作台，带有 `Notion AI` 式的统一入口体验，但不承接编辑器本身。
