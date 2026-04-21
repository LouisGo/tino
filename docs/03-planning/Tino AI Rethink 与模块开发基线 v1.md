# Tino AI Rethink 与模块开发基线 v1

> 日期：2026-04-13
> 角色：当前 Tino AI 模块开发的唯一执行基线
> 适用范围：AI runtime、批处理、落库、反馈记忆、AI Ops、能力接入
> 取代：
> - `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md`
> - `docs/03-planning/AI Review 当前实现与 Mock 链路说明.md`

## 1. 这份文档解决什么问题

这份文档用于结束当前仓库里“`/ai review` 过渡方案”和“未来 AI 主链路”混在一起的状态。

它只回答三类问题：

- Tino 的 AI 现在到底该按什么形态继续做
- 哪些旧实现只算过渡资产，不该再继续扩建
- 后续 AI 模块开发应按什么顺序推进

如果本文件与旧 AI 文档冲突，以本文件为准。
如果本文件与 `技术冻结记录` 冲突，应同步更新两边，不能保留双轨口径。

## 2. 三个不能再走弯路的判断

### 2.1 落库质量层是 MVP 的核心挑战

Tino 的难点不是把文本格式化成 Markdown。
真正难的是：

- 这条内容值不值得进入知识层
- 它的核心信息是什么
- 它是否应该并入已有 topic
- 它是否只是短期噪音或重复信息

因此，后续 AI 开发应以“落库质量”作为主目标，而不是以 `/ai` 页面、模型接通、或审阅交互作为主目标。

### 2.2 分层依据是触发频率与生命周期，不是模型强弱

系统必须明确分成两层：

- 高频实时层：轻量规则过滤、精确去重、近重复预筛、批次编排
- 低频异步层：强模型理解、聚类、归并、写知识层

不要把“用更强模型”误当成“应该放到更底层实时链路”。
低频异步层可以更重，但必须更稳、更可审计。

### 2.3 LLM 调用有两种性质，必须物理隔离

- 交互式调用：用户显式触发，需要即时反馈
- 后台编译：系统触发，需要脱离页面生命周期稳定运行

对应的工程归属固定为：

- 交互式 AI：`Renderer`
- 后台批处理编译：`Rust async runtime`

两条路径不能继续共用 `/ai` 页面状态、React hook 状态机、或手动审阅工作台语义。

## 3. 当前仓库里哪些资产还保留，哪些降级

### 3.1 保留

- `AI Provider` 设置页保留
- provider profile 多配置与当前启用项保留
- 现有 batch / queue / topic / inbox / review 文件与命令边界保留
- 现有 feed / feedback 类可复用组件可保留

这些资产现在的角色是：

- 内部调试能力入口
- 过渡期能力配置入口
- 后续 AI runtime 的可复用底座

### 3.2 降级

以下内容不再是目标架构的中心：

- `/ai` 页面
- review-first 心智
- renderer 内存中的手动 candidate run
- `applyBatchDecision` 所代表的手动持久化桥接语义
- 基于 `/ai` 页面是否可见来理解后台 AI 状态

`/ai` 页面现在应被视为：

> 可被推翻或重做的过渡性 legacy surface

补充实现边界：

- legacy `/ai review` 如继续保留，其 Rust 侧 DTO、持久化桥接、兼容命令实现应放在 `src-tauri/src/ai/*` 等 feature 模块
- `commands/*.rs` 只保留 IPC adapter，不作为 legacy review 或 background compiler 的 feature home

## 4. Tino AI 的新目标形态

Tino 的 AI 现在应被定义为：

> 一个由 Rust 持有后台编译主链路、由 Renderer 持有交互式即时 AI、由 Rust 持有知识写入权威边界、并由本地反馈记忆持续提升落库质量的后台知识编译系统。

对普通用户，主路径仍然是：

> 被动捕获 -> 原始归档 -> 后台编译 -> 结果出现

而不是：

> 打开 `/ai` -> 看候选结果 -> 人工逐批确认

## 5. 模块边界

### 5.1 Input Gate

位置：`Rust`

职责：

- capture 标准化
- 精确去重
- 轻量规则过滤
- 保守的近重复预筛
- queue / batch 编排

约束：

- 不在这里调用重模型
- 不把这层做成 UI 配置堆
- 不把“疑似重复”直接等同于“可删除”

### 5.2 AI Capability Layer

位置：配置在 `Rust + Renderer`，业务调用边界必须显式抽象

职责：

- 把“当前可用 AI 能力”抽象成统一能力源
- 允许 provider-backed 能力
- 允许 mock / 注入式能力
- 允许后续替换底层来源而不改业务模块语义

约束：

- 业务模块不直接依赖某个 provider SDK
- provider settings 不是 AI 架构中心，只是能力来源之一

### 5.3 Background Compiler Runtime

位置：`Rust async runtime`

职责：

- 混合触发调度
- batch 状态机
- 重试与失败隔离
- 崩溃恢复
- 后台 compile job 执行
- 结果落盘编排

约束：

- 不依赖 React 组件是否挂载
- 不依赖主窗口隐藏后的 renderer 存活
- 不把后台批处理挂在 `/ai` 页按钮上

### 5.4 Interactive AI

位置：`Renderer`

职责：

- 用户显式触发的即时 AI 交互
- 需要快速响应的解释、改写、问答或局部操作
- 当前可以由首页 `HomeChat` 这类直接入口承载

约束：

- 不作为后台编译状态真相源
- 不持有 batch runtime 的权威状态
- 不承担自动落盘主链路
- 不应吞掉状态概览、设置入口与次级 AI Ops 观测面

### 5.5 Compile Contract

位置：Rust 为边界真相源，必要时暴露到 Renderer

至少冻结下面几类结构：

- `BatchCompileJob`
- `BatchCompileInput`
- `BatchCompileDecision`
- `PersistedKnowledgeWrite`
- `FeedbackEvent`
- `QualitySnapshot`

原则：

- 进入知识层的结构化输出必须先过 schema
- 路径、文件名、落盘格式由程序决定
- AI 只给结构化建议，不直接控制真实文件路径

### 5.6 Knowledge Persistence

位置：`Rust`

职责：

- 写入 `topics/`
- 写入 `_inbox/`
- 维护 topic index
- 写审计与运行态

约束：

- 幂等
- 可回放
- 可审计

### 5.7 Feedback Memory

位置：`SQLite + Rust`

职责：

- 记录用户纠错
- 记录 topic 使用与访问模式
- 记录删除与保留行为
- 为后续 compile prompt 注入本地偏好

这不是“以后再做的锦上添花”，而是落库质量系统的一部分。

### 5.8 AI Ops Surface

位置：`Renderer`，但只作为次级入口

职责：

- 看 compile job 状态
- 看最近写入结果
- 看失败、重试、异常
- 看反馈与质量指标
- 提供回放与调试入口

当前推荐起步形态：

- 先用 Rust-owned snapshot query + typed subscription 组合保证冷启动与热同步
- 允许先以 dashboard 次级摘要卡或轻量信息面板接入，不要求一开始就上完整 AI Ops 页面

不要再把它设计成 review-first 工作台。

## 6. 存储基线

### 6.1 Markdown 知识资产

- `daily/`：原始归档
- `topics/`：高置信长期知识
- `_inbox/`：低置信或暂不稳定的知识出口

### 6.2 `_system/` 运行态资产

短中期继续允许使用 JSON 文件保存：

- queue
- batch
- runtime
- job audit
- write log

但这些文件的角色应收敛为：

- Rust runtime 的持久化状态与审计面

而不是：

- `/ai review` 页面专属数据格式

### 6.3 本地 SQLite

优先承接：

- feedback events
- quality metrics
- 偏好记忆
- topic usage / retention 信号

不要把这层延后到 UI 都写完才考虑。

## 7. 当前就要冻结的开发约束

### 7.1 `/ai` 页面不是 AI 模块的中心

后续如需保留该路由，也应重做为 `AI Ops` 或其他次级调试面。
不要再围绕现有 `/ai review` 语义扩展新产品逻辑。

### 7.2 Provider UI 不是 AI 架构中心

provider settings 可以继续保留，但只应承担：

- 输入能力配置
- 调试连通性
- 内部验证

不要让“用户输入 baseURL/apiKey”反过来决定 AI 模块结构。

### 7.3 后台编译不依赖 UI 生命周期

任何新的自动编译、自动重试、自动落盘能力，都必须先落在 Rust runtime 里。

### 7.4 先 contract 和存储，再 UI

在以下三样未定之前，不继续投入新的 AI UI：

- compile contract
- Rust 权威状态机
- feedback / quality 存储结构

### 7.5 纠错率是第一指标

从 MVP 第一天开始埋点：

- 用户主动纠错率

当前目标：

- `< 5%`

没有这个数字，就不能判断 AI 是不是在真正变好。

## 8. MVP 之后仍应坚持的产品原则

### 8.1 被动捕获优先

剪贴板仍是当前第一触手。
后续扩展 Share Extension、截图 OCR、浏览器插件，都是为了降低录入摩擦，而不是为了做更多显眼入口。

### 8.2 topic 仍是系统生成结果

用户不先创建 topic。
topic 是后台编译结果，而不是前置容器。

### 8.3 专题确认应嵌入自然路径

不要创造“专门去管理专题”的任务。
纠错、确认、偏好反馈应嵌在正常浏览或消费结果的路径里。

## 9. 推荐开发顺序

### Phase A. Contract Reset

- 定义 compile contract
- 定义 Rust 权威状态机
- 定义 feedback / quality event 模型

### Phase B. Storage Reset

- 明确 `_system` 的 runtime/job/audit 文件结构
- 增加 SQLite feedback / quality store
- 明确 topic index 正式资产

### Phase C. Capability Boundary

- 保留 provider settings
- 抽象 AI capability source
- 移除业务逻辑对旧 `/ai review` 流程的依赖

### Phase D. Rust Background Compiler

- Rust runtime 驱动 batch compile
- 加重试、恢复、失败隔离
- 接通自动知识落盘
- 当前仓库已接上 provider-backed background compile 主链路
- DeepSeek 背景编译采用“简单批次 `deepseek-chat` / 复杂批次 `deepseek-reasoner`”的自动选模
- provider-bound compile 需要最小本地安全防护；明显 token / credential capture 不应发往外部模型

### Phase E. Quality Loop

- 记录纠错、删除、保留、访问行为
- 将本地偏好注入 compile context
- 开始看纠错率指标

### Phase F. AI Ops Surface

- 用新的运行态与指标重做次级调试入口
- 清理或替换 legacy `/ai` 页面

### Phase G. 新触手与知识健康

- Share Extension / Services
- topic wiki / provisional topic
- 知识健康度审计
- 图谱与跨 topic 关系

## 10. 当前代码库的正确理解

截至这份文档，当前仓库不是“AI 已经做完”，也不是“只有 provider 设置页”。

它的正确理解是：

> 输入侧和原始归档链路已经真实跑通；provider settings 不再只是过渡 UI，Rust-owned background compiler 现在也已接上真实 provider-backed compile；当前真正缺的主要是落库质量层、feedback memory、quality metrics，以及新的 AI Ops 次级入口。

## 11. 文档维护规则

如果后续 AI 方向继续变化，至少同步更新：

- `docs/03-planning/HANDOFF.md`
- `docs/03-planning/技术冻结记录.md`
- 本文件

如果某个旧文档继续保留但已不再指导开发，必须显式标记为 `deprecated`，不能让它和本文件并列生效。
