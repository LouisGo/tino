# Home Chat Gemini化与多会话 MVP 计划 v0.1

> 日期：2026-04-20
> 状态：historical
> 当前说明：多会话 Home Chat 基础能力已大体落地；当前真实状态请读 `docs/03-planning/HANDOFF.md`
> 适用范围：`/home` 交互式 AI Chat 重构
> 目标：先形成可评审、可直接实施的专项方案；本文件不是当前真实状态声明

## 1. 这次要解决什么

当前 `/home` 已经有最基础的单轮 chat，但存在几个明显问题：

- 只有单次问答，没有真正的多轮会话
- 视图结构不对，响应被放在 composer 下方，不能像 Gemini Web 那样进入标准消息流
- 没有多会话管理，用户无法按话题切换上下文
- 没有稳定的流式输出、思考过程、停止、重试、重新编辑等基础能力
- 现在的实现仍然偏路由页临时拼装，不适合后续放进侧边栏或浮窗

这次目标不是把 Tino 变成“chat-first 产品”，而是把首页里的交互式 AI 模块做成一个可复用、像 Gemini Web 一样自然的聊天组件体系。

## 2. 产品结论

### 2.1 会话模型

不再采用“单一长期累积会话”。

改为：

- 支持多个会话
- 用户可以主动创建新会话
- 每个会话按各自主题维护上下文
- 模型请求只读取当前会话最近 `30` 条消息
- 不做跨会话上下文拼接

### 2.2 新会话的创建语义

`New chat` 不会立刻落一条空会话到数据库。

改为：

1. 用户点击 `New chat`
2. UI 进入一个本地 draft 状态
3. 只有当用户真正发送第一条消息时，才创建持久化会话

这样做的原因：

- 不会产生大量空会话垃圾数据
- 更接近 Gemini / ChatGPT 的体验
- 更适合未来在侧边栏或浮窗里复用

### 2.3 会话标题

新会话首次发送后，系统会自动为该会话生成标题。

具体规则：

- 首次用户消息提交成功后，先以临时标题 `新对话` 创建会话
- 然后基于“第一条用户消息”异步生成一个短标题
- 标题生成不阻塞主回答流式输出
- 标题生成成功后回写该会话
- 如果标题生成失败，则退化为“第一条消息前 `18-24` 个可见字符”的截断标题

标题生成输入范围：

- 只使用第一条用户消息
- 不使用整段历史
- 标题提示词要求输出短标题，语言默认跟随用户消息语种

### 2.4 首页交互形态

首页 chat 交互对齐 Gemini Web：

- 空态：欢迎文案 + 大 composer 居中
- 一旦开始对话：composer 沉底，消息区接管主视图
- 用户消息右对齐，助手消息左对齐
- 支持流式输出
- provider 有 reasoning 时展示思考过程
- 支持错误、重试、停止生成、重新编辑最近一条用户消息

## 3. 实施边界

### 3.1 Rust 与 Renderer 的职责

保持当前冻结边界，不把交互式模型调用搬到 Rust。

职责划分如下：

- Rust 负责：
  - 多会话与消息的权威持久化
  - SQLite 存储
  - 会话列表 / 会话详情 Query
  - 会话修改 State Command
  - typed event 广播
- Renderer 负责：
  - provider 选择
  - prompt 组装
  - 流式模型调用
  - reasoning trace 收集
  - 停止生成
  - draft / 编辑态 / 滚动 / composer UI 状态

结论：

- 交互式 AI 仍然是 `Renderer-owned model call`
- 多会话和持久化状态是 `Rust-owned persisted state`

### 3.2 存储位置

这次不把 chat 历史塞进 `settings.json`。

改为：

- 使用 SQLite
- 放在应用 durable app storage 根目录
- 不放进 `clipboard-cache/`

建议文件：

- `~/Library/Application Support/Tino/{shared|production}/interactive-chat.db`

这样比复用当前 `clipboard-cache/tino.db` 更合理，因为：

- clipboard history 和 interactive chat 是两个不同域
- 保留独立 schema / migration 边界更干净
- 后续侧栏、浮窗、主窗口都能共享同一份 chat 存储

### 3.3 写入优化

不做“每个 token 一次 SQLite 写入”。

MVP 写入策略：

- 用户消息提交时立即持久化 user message
- assistant 流式过程只保留在 Renderer 内存
- assistant 到达终态时再一次性持久化
  - `completed`
  - `failed`
  - `stopped`
- 标题生成成功后单独更新一次 conversation

这样可以减少写放大，也更稳。

## 4. SQLite 数据结构

## 4.1 conversations

建议表：`chat_conversations`

字段：

- `id`
- `title`
- `title_status`
  - `pending`
  - `ready`
  - `failed`
  - `fallback`
- `title_source`
  - `model`
  - `fallback`
  - 预留 `manual`
- `preview_text`
- `message_count`
- `created_at`
- `updated_at`
- `last_message_at`

索引：

- `updated_at DESC`
- `last_message_at DESC`

### 4.2 messages

建议表：`chat_messages`

字段：

- `id`
- `conversation_id`
- `ordinal`
- `role`
  - `user`
  - `assistant`
- `content`
- `reasoning_text`
- `status`
  - `completed`
  - `failed`
  - `stopped`
- `error_message`
- `provider_label`
- `response_model`
- `created_at`
- `updated_at`

索引：

- `(conversation_id, ordinal)`
- `(conversation_id, created_at)`

约束：

- 一个会话内消息顺序用 `ordinal` 保证
- 当前 MVP 只允许重写“最近一条 user message”
- 重写最近一条 user message 时，删除其后的 trailing assistant 结果

## 5. IPC 与状态接口

### 5.1 Query

- `list_home_chat_conversations()`
  - 返回 conversation summary 列表
- `get_home_chat_conversation(conversation_id)`
  - 返回单个 conversation detail + messages

### 5.2 State Command

- `create_home_chat_conversation(initial_user_message)`
  - 创建新会话并写入第一条 user message
- `append_home_chat_user_message(conversation_id, user_message)`
  - 给现有会话追加一条 user message
- `replace_latest_home_chat_assistant_message(conversation_id, assistant_payload)`
  - 把当前末尾 assistant 结果替换为本次最新终态结果
  - 用于首次生成、失败重试、停止后的终态落盘
- `rewrite_latest_home_chat_user_message(conversation_id, user_message)`
  - 更新最近一条 user message
  - 清除其后的 trailing assistant 结果
- `update_home_chat_conversation_title(conversation_id, title, title_status, title_source)`
  - 标题生成完成后回写

### 5.3 Subscription

新增 typed event：

- `HomeChatConversationsUpdated`

事件用途：

- 精确通知 conversation list 和 active conversation 失效刷新
- 支持主窗口、侧栏、浮窗之间同步

事件最小字段：

- `reason`
- `conversation_id`
- `refresh_list`
- `refresh_conversation`

## 6. Renderer 组件与模块划分

这次不再让 `/home` 路由页自己持有聊天状态机。

改为以下结构：

- `features/chat/`
  - `components/`
    - `home-chat-workspace`
    - `chat-conversation-list`
    - `chat-message-list`
    - `chat-message-bubble`
    - `chat-thinking-panel`
    - `chat-composer`
    - `chat-empty-state`
  - `hooks/`
    - `use-home-chat-workspace`
    - `use-home-chat-stream`
  - `lib/`
    - `home-chat-runtime`
    - `home-chat-context-window`
    - `home-chat-title-generator`

职责分离：

- 路由页只做装配
- workspace 负责编排 conversation list + active conversation
- surface 负责单会话渲染
- runtime 负责调用 provider 和组装 messages
- tauri wrapper 负责 IPC 和 event

## 7. 首页布局方案

为了兼顾“Gemini 风格”和“后续组件复用”，首页采用“两层结构”：

### 7.1 Home route 负责

- 知识根目录 / 版本号等轻量 meta
- provider / model 当前选择
- 把这些配置传给 chat workspace

### 7.2 Chat workspace 负责

- conversation rail
- 消息流
- composer
- 空态 / loading / 错误 / streaming

桌面端建议布局：

- 左侧：conversation rail
- 右侧：active chat surface

窄宽度或未来嵌入式模式：

- conversation rail 收进 drawer / popover
- active chat surface 独占内容区

## 8. 关键交互细节

### 8.1 流式输出

- 发送后先持久化 user message
- Renderer 根据该会话最近 `30` 条有效消息发起流式请求
- 在内存里持续收集：
  - `assistant text`
  - `reasoning text`
  - `latency`
  - `response model`
- 终态时一次性落盘 assistant message

### 8.2 思考过程

- provider 如果给 reasoning delta，则显示 thinking 面板
- 默认折叠
- 无 reasoning 的 provider 不展示空白 panel
- reasoning text 不按 token 落库，只在终态时随 assistant message 一并保存

### 8.3 Retry

MVP 只支持重试最近一条 user message 对应的 assistant 结果。

流程：

1. 找到末尾 user turn
2. 重新发起流式请求
3. 终态时用新 assistant 结果替换之前的 latest assistant

### 8.4 重新编辑

MVP 只支持重新编辑最近一条 user message。

流程：

1. 点击 `Edit`
2. 把最近一条 user message 内容回填到 composer
3. 提交后更新该 user message
4. 删除其后的 trailing assistant
5. 重新生成新的 assistant

### 8.5 停止生成

- Renderer 持有 abort handle
- 点击 `Stop` 时中止本次流式请求
- 将当前已收到文本以 `stopped` 状态保存为 terminal assistant message
- 后续允许用户基于这条最新 user turn 再次 `Retry`

## 9. 这次不做什么

本期明确不进入：

- 多会话搜索
- 会话 pin / archive / delete UI
- 会话手动重命名 UI
- 历史任意分叉树
- 多模态附件进模型
- 跨会话记忆融合
- 向量检索 / RAG
- 后台 AI 编译与交互式 chat 合流

附件策略保持：

- 保留附件入口与回显
- 本期不带入模型上下文

## 10. 实施顺序

建议实施顺序：

1. Rust SQLite store + DTO + IPC + event
2. Renderer tauri wrapper + query keys + data hooks
3. provider-access 增加 chat streaming 能力
4. 新 chat workspace 组件
5. `/home` 路由装配与视觉重构
6. typecheck / cargo check / gen:bindings / 基础交互验证

## 11. 验收标准

完成后应满足：

- 首页初始态是 Gemini 风格空会话
- `New chat` 可创建新的 draft 会话
- 首次发送后自动生成并固定会话标题
- 可在多个会话之间切换
- 每个会话能保留自己的历史
- 请求只带当前会话最近 `30` 条消息
- assistant 支持流式文本
- 有 reasoning 时可展示思考过程
- 支持停止、重试、重新编辑最近一条 user message
- 重启应用后会话列表与消息能恢复
- 侧栏 / 浮窗后续可复用同一套 workspace 或 surface，而不是再次复制逻辑

## 12. 待评审重点

这份方案最需要你拍板的点有四个：

1. conversation rail 是首页固定左栏，还是默认收成 popover
2. 标题 fallback 是“截断首条消息”还是固定 `新对话`
3. `stopped` assistant 是否保留 partial text 并持久化
4. MVP 是否同时提供“删除会话”入口，还是先只做创建与切换

在这四点没有新的反对意见时，可以按本文件直接进入实现。
