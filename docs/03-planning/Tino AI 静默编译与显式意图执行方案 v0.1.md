# Tino AI 静默编译与显式意图执行方案 v0.1

> 日期：2026-04-21
> 角色：基于多轮脑暴与当前代码现实收敛出来的下一阶段 AI 执行方案
> 适用范围：静默后台语义处理、显式用户意图、长周期主题收敛、输入适配器边界
> 依赖基线：
> - `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
> - `docs/03-planning/技术冻结记录.md`
> - `docs/03-planning/HANDOFF.md`

## 1. 这份文档解决什么问题

这份文档用于收束最近几轮 AI rethink 讨论里已经形成的明确共识，避免后续工作继续失真。

本轮讨论暴露出的核心问题不是“模型还不够强”，而是当前系统对剪贴板的理解粒度不对：

- `20 条 / 10 分钟` 的 batch promotion 更像调度窗口，不像语义窗口
- 真实剪贴板是混沌输入流，不会天然按短时间窗口组织成可直接落库的知识单元
- 单次小 batch 可以承担初筛与保守标记，但很难直接承担主题提炼与高质量知识落盘
- 用户的大多数 AI 价值来自静默后台整理；少数价值来自用户显式给方向或显式丢输入

因此，后续 AI 方案必须从“小 batch 直接决定语义与 topic”转向：

> 静默异步编译为主，显式用户意图为辅；日级与跨日线程收敛为主要认知层，小 batch 只保留为调度与初筛层。

## 2. 本轮形成的共识

### 2.1 `20 条 / 10 分钟` 不是最终语义窗口

- 当前 Rust runtime 的 `20 条 / 10 分钟` 触发仍然保留
- 但它只定义 queue promotion / triage 的调度窗口
- 它不再被视为最终知识判断窗口
- 它不应再直接承担“这一批就该进哪个 topic”的主认知职责

### 2.2 `daily/` 仍然是原始真相源

- `daily/*.md` 继续只保存原始归档
- 不让 AI 改写 `daily/`
- 任何静默分析、day digest、thread 提炼、rolling topic 收敛，都应建立在 `daily` 之上

### 2.3 AI 必须拆成两条 lane

必须明确区分：

- `静默 lane`
  - 异步
  - 后台
  - 不打扰用户
  - 负责在一天到几天的混乱输入里提炼脉络、主题与潜在机会
- `显式 lane`
  - 用户明确给方向
  - 用户明确提问
  - 用户明确拖入文件或素材
  - 负责围绕用户已知目标做更高优先级的理解与产出

两条 lane 共享能力底座，但不能混成同一套 UI 心智或同一套批处理语义。

### 2.4 用户意图要进入系统，但不能做成重算法

后续应允许用户明确表达“最近我在关注什么”，但当前不应直接做成重推荐系统或复杂兴趣画像。

正确的第一步是引入轻量 `attention hint / focus signal`：

- 由用户显式动作触发
- `v0.1` 不做自动衰减，只允许显式关闭或被新的 hint 替换
- 只影响召回、排序、thread merge 优先级与建议候选
- 不改写原始证据
- 不直接决定 topic
- 不成为新的真相源

### 2.5 文件拖入不是另一个 AI 岛，而是新的输入通道

后续无论接 `doc / ppt / xlsx / md / html / image / video`，都不应做成独立 AI 孤岛。

正确做法是：

- 统一抽象为 `input adapter`
- 先把不同输入归一到统一证据模型
- 再接入同一条静默编译链路

`MarkItDown` 可以作为文档类输入的一个 adapter，但它不是架构中心。

## 3. 新的目标形态

### 3.1 默认主路径

后续默认主路径应被理解为：

> 被动输入 / 拖入输入 -> 原始证据归档 -> 静默后台分析 -> day digest / thread -> rolling topic -> 建议或结果出现

而不是：

> 一小批 capture 到达 -> 直接决定 topic -> 立即落库

### 3.2 静默 lane

静默 lane 的职责：

- 从混沌输入流里找出真正有价值的 thread
- 在当天范围内提炼 day digest
- 在多天范围内做 rolling merge
- 形成较稳的 `topic`、低置信的 `_inbox`、以及后续可扩展的建议候选

它是后台知识编译系统的主脑。

### 3.3 显式 lane

显式 lane 的职责：

- 响应 HomeChat 或其他即时 AI 入口
- 接收用户明确的目标、方向、任务或文件输入
- 生成显式任务上下文与短期 focus signal
- 为静默 lane 提供“少猜一点”的参考

它不是后台编译真相源，但它可以产生高价值的注意力锚点。

## 4. 建议的对象模型

以下对象用于后续执行方案，不代表今天必须一次性全部实现。

### 4.1 Evidence Record

统一的输入证据对象。

来源可以包括：

- clipboard capture
- future file import
- future OCR / transcript / metadata extraction
- 用户显式提交的补充材料

### 4.2 Triage Batch

`Triage Batch` 是调度层对象，不是最终语义对象。

它承担：

- 去重
- 敏感信息拦截
- 低价值噪音预筛
- 粗粒度候选聚合
- 为后续 day-level 处理提供局部 hint

### 4.3 Day Digest

`Day Digest` 是第一语义层。

它也是整个方案里技术风险最高、最容易失败的一层。

它关注的是：

- 今天出现了哪些 thread
- 哪些线索值得继续关注
- 哪些信息只应保留为 `_inbox`
- 哪些只是噪音与过期碎片

补充判断：

- 同一天的剪贴板在时间上连续，但在语义上经常完全不连续
- `Day Digest` 本质上带有“从缺失上下文的混沌输入里恢复 thread”的无监督聚类难题
- 第一次真实历史 replay 很可能会反过来推翻我们对 digest 形态的初始设想
- 这不是坏事，说明 replay 在帮我们做 contract 校准，而不是在替错误方向补逻辑

### 4.4 Rolling Topic

`Rolling Topic` 是跨日收敛层。

它的风险不低于 `Day Digest`，只是失败模式更隐蔽。

它关注的是：

- 多天输入是否在表达同一主题
- 这个主题是否足够稳定到值得进入 `topics/`
- 它和现有 topic 的关系是复用、分裂、还是新建

补充判断：

- `Rolling Topic` 只有在 `Day Digest` 足够稳时才有意义
- 如果日级 thread 恢复不稳，跨日 merge 只会把错误放大成长期知识污染
- 因此它必须建立在日级基准与真实历史 replay 之上，不能先凭直觉补 merge 逻辑

### 4.5 Attention Hint

`Attention Hint` 是显式 lane 写给静默 lane 的轻量偏置信号。

它可以来自：

- 用户显式选择近期关注方向
- 用户显式发起某个研究或整理任务
- 用户拖入一组明确为“同一工作流”的文件

它不是 topic，也不是用户画像，更不是长期推荐引擎。

## 5. 用户可感知的系统输出

静默 lane 不能只在后台运行而没有用户感知锚点。

如果用户看不到系统恢复了什么 thread、形成了什么 digest、最近有哪些主题在收敛，那么即使后台跑通，也不会形成“系统在帮我整理知识”的产品感知。

### 5.1 Day Digest 出现在哪里

- 第一版应优先出现在首页或 dashboard 的次级摘要区，而不是藏在纯日志或 AI Ops 调试面里
- 它展示的是“今天系统恢复出的几条主要脉络 / 待确认线索”，不是逐条 capture 列表
- 当天无足够稳定 thread 时，可以只显示“待确认线索”，不要强行生成完整 digest

### 5.2 什么时候出现

- 当静默编译达到最小稳定度时出现
- 至少要支持“次日第一次打开时，看到前一天 digest”
- 如果当天处于高噪声、低置信度状态，允许延迟、降级或不展示完整 digest

### 5.3 用户如何纠错或确认

- 每条 digest / rolling topic 至少要提供轻量确认入口，而不是把用户赶回 review-first 工作台
- 第一版只需要极少动作，例如“这条有用”“这条是噪音”“这条方向不对”
- 这些动作应写回 feedback memory 或显式 lane，而不是直接改写 `daily/`

## 6. 输入适配器边界

### 6.1 当前输入

- clipboard plain_text
- clipboard rich_text
- link
- 非文本占位回显

### 6.2 后续输入

后续可扩展输入至少包括：

- `doc / docx / ppt / pptx / xlsx / pdf / md / html`
- `image`
- `video`

### 6.3 适配原则

- 文档类输入可先尝试转为 markdown 或结构化文本
- 图片、视频不能强行等同于 markdown，本质上应走各自的内容提取 adapter
- 所有 adapter 最终都应输出统一 evidence shape
- 不让具体库或 SDK 反向决定系统主架构

## 7. 立刻执行的顺序

### 7.0 第零步：先做过渡保护

- 当前 provider-backed background compile 已真实接上，但它仍带着“小 batch 直接落库”的旧语义
- 从 `triage -> day digest -> rolling topic` contract reset 开始时，旧链路的最终 `topics/` 落盘必须暂停、降级为 dev-only，或重定向到独立审计沙盒
- 在新 contract 冻结前，允许继续保留 `daily/` 原始归档、triage、runtime audit 与 replay 入口

### 7.1 第一阶段：先手工标注 2-3 天真实历史

先不要直接跑 replay。

先基于本机真实剪贴板历史手工标注 `2-3` 天，定义：

- 理想的 `Day Digest` 应该恢复出哪些 thread
- 哪些内容应保留为 `_inbox`
- 哪些内容只是噪音或日内碎片
- 哪些 thread 在跨日后应继续 merge 成 `Rolling Topic`

这套标注是后续 replay 的判断基准。没有这套基准，`Day Digest` 做得“够不够好”会一直陷入空转。

### 7.2 第二阶段：真实历史回放

先基于本机真实剪贴板历史做：

- `single-day replay`
- `multi-day replay`
- 噪音 / thread / topic 混杂场景分析

目标：

- 验证真实历史里，小 batch 为什么不足以承担最终语义职责
- 找出最常见的 thread 恢复失败模式
- 验证手工标注出来的理想 `Day Digest` 与当前 contract 偏差在哪里

补充要求：

- 不要预设第一次 replay 会好看
- 如果 replay 结果反过来质疑 `Day Digest` 设计，应先修 contract，再补提示词或 merge 逻辑

### 7.3 第三阶段：把小 batch 降级为 triage 层

当前 background compile 不应继续围绕“小 batch 直接落库”优化。

应先把它收束为：

- 初筛
- 本地守门
- 粗聚类
- 候选线索标记

### 7.4 第四阶段：定义 day digest / rolling topic contract

在 Rust 边界上先冻结：

- day digest 的输入与输出
- rolling topic merge 的输入与输出
- triage 与 day digest 的边界

### 7.5 第五阶段：引入最小 attention hint

先做轻量版本：

- 用户显式给方向
- 写入可显式关闭或替换的 hint
- 只影响排序与召回

不要一开始做复杂兴趣算法。

### 7.6 第六阶段：输入适配器化

为后续文件拖入预留清晰 adapter 边界。

建议先从文档类输入起步，再考虑图片、视频。

## 8. 质量评测应如何升级

当前 batch-level replay 仍然有价值，但它只能评测低层 gating 与局部 routing，不足以代表最终语义质量。

下一阶段应新增：

- `real-history replay`
- `single-day digest benchmark`
- `multi-day rolling-topic benchmark`

新的重点指标应逐步加入：

- useful-thread recall
- false knowledge intrusion
- daily thread coherence
- cross-day topic stability
- explicit focus utilization quality

## 9. 这轮明确不做什么

- 不把 `20 条 / 10 分钟` 继续当最终语义窗口
- 不让 AI 改写 `daily/`
- 不把 attention hint 做成复杂推荐系统
- 不在 `v0.1` 里给 attention hint 加自动衰减参数
- 不把 `MarkItDown` 做成系统中心
- 不让显式用户意图直接覆盖原始证据与静默判断
- 不回到 `/ai review` 工作台主导的思路

## 10. 一句结论

本轮共识可以压缩成一句话：

> Tino 后续 AI 的主脑应是“静默异步编译器”，它先在 `daily` 之上恢复 day-level 与 multi-day 的真实工作脉络；交互式 AI、用户显式方向和文件拖入只是给这个主脑增加更清晰的注意力锚点，而不是替代它。
