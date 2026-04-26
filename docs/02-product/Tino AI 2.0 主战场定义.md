# Tino AI 2.0 主战场定义

> 日期：2026-04-26
> 角色：冻结当前阶段单一主战场、单一主循环与产品收口原则
> 状态：最新共识

## 1. 为什么需要这份文档

`Tino AI` 的愿景可以很大，但当前产品不能同时把创作协作、研究工作台、静默策展系统都当成平行主线去做。

如果这样做，结果大概率会是：

- 战线过长
- 架构重心不清
- 核心闭环不强
- 样样想做，样样都松

所以这份文档只解决一件事：

> 当前阶段我们到底只打哪一个主战场。

## 2. 单一主战场

当前阶段的单一主战场是：

> `Project Corpus Copilot`

也就是：

> 围绕一批用户自己的材料持续工作，让 AI 能稳定地问、找、想、改、写，并把结果落回 Markdown。

当前阶段的主用户心智也随之固定为：

> “我在推进一个 project。”

这条心智高于：

- “我只是来随便聊聊”
- “我只是来搜一个答案”
- “我只是来看看 AI 能做什么”

## 3. 单一主循环

当前阶段唯一应该优先打穿的主循环是：

> `Import -> Normalize -> Grounded Ask/Research -> Draft/Distill -> Save as Markdown Artifact`

展开就是：

1. 用户把材料丢进来
2. 系统把材料归一成可追溯 Markdown 语料
3. 用户围绕这些语料对话、检索、研究、改写
4. 系统产出草稿、总结、digest、patch proposal
5. 结果保存为 Markdown 资产

## 4. 为什么不是先做 `Notion AI`

`Notion AI` 的强项建立在：

- 已结构化 workspace
- 文档编辑器
- 协作、权限、自动化

这不是 `Tino` 当前最稳的起点。

如果现在硬追这条路，代价会是：

- 范围迅速膨胀
- 编辑器 / 工作区管理反向定义架构
- AI 产品主线被“以后可能会有的自动化”稀释

## 5. 为什么更接近 `NotebookLM`

`Tino` 当前最自然的起点是：

- 围绕 sources / corpus 工作
- grounded answer
- research
- project-oriented chat
- 材料导入后形成持续工作域

这就是 `NotebookLM` 一侧的产品内核。

## 6. 三个场景如何被收编

### 6.1 Writing Project

围绕小说章节、角色设定、世界观资料形成 corpus。

### 6.2 Research Project

围绕 PDF、PPT、网页、笔记形成研究 corpus。

### 6.3 Inbox Project

围绕收藏、剪贴板、杂项输入形成默认材料池。

关键点：

> 这三者不应是三个不同产品，而应是同一主内核上的三个 project template。

## 7. `查 / 研 / 产` 的关系

当前阶段三种最常见动作是：

- `查`：围绕现有语料找答案
- `研`：围绕现有语料推进理解
- `产`：把结果沉淀成 Markdown artifact

它们不是三个独立产品，而是同一个主循环里的三个阶段性动作。

## 8. 当前阶段真正该做强的东西

- project / corpus
- source grounding
- 多格式材料归一
- `查 / 研 / 产` 三种工作协议
- scope 明示
- Markdown artifact 写回
- 轻量 digest / resurfacing

## 9. 当前阶段明确不做强的东西

- 完整编辑器
- 通用工具执行 agent
- 重陪伴型人格记忆
- 超深垂直专用创作系统
- 很重的生活管家型主动提醒

## 10. 一句结论

当前阶段 `Tino AI` 的主战场不是“做一个很聪明的万能 AI”，而是：

> 做一个围绕项目语料持续工作的 Markdown-first AI 工作台。
