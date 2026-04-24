# Tino AI 静默编译优化与迁移方案 v0.1

> 日期：2026-04-22
> 角色：把当前已跑通的 provider-backed background compiler，从“小 batch 直接落库”收束到 `triage -> day digest -> rolling topic -> final write` 的执行细化方案
> 适用范围：静默编译主链路、显式意图接线、day-level / multi-day contract、迁移顺序、质量门槛
> 依赖基线：
> - `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
> - `docs/03-planning/Tino AI 静默编译与显式意图执行方案 v0.1.md`
> - `docs/03-planning/Tino AI 开发期质量管线计划 v0.1.md`
> - `docs/03-planning/技术冻结记录.md`
> - `docs/03-planning/HANDOFF.md`

## 1. 这份文档补什么空缺

现有文档已经把方向讲清楚了：

- `20 条 / 10 分钟` 只是调度窗口，不是最终语义窗口
- 真正的语义层要上移到 `day digest / rolling topic`
- 显式 lane 只提供轻量 `attention hint`

但当前仓库里已经真实存在的是另一套更低层的运行现实：

- Rust background compiler 已经能真实调 provider、产出 `BatchCompileDecision`、并直接写 `topics/` / `_inbox/`
- `AiSystemSnapshot`、`FeedbackEvent`、`QualitySnapshot`、`job-audit`、`writes.jsonl` 已经有了
- replay runner 也已经能评测 `legacy|background`

因此当前缺的不是“再写一份愿景文档”，而是：

1. 如何不推翻现有 Rust runtime，就把它降级回 `triage` 层
2. 如何新增 `day digest / rolling topic` 这一层，而不是直接替换全部现有 contract
3. 如何让 replay、AI Ops、feedback、最终知识写入共用同一套分层语义

## 2. 当前最关键的结构性落差

### 2.1 `BatchCompileDecision` 同时承担了 triage 与最终知识输出

当前 `BatchCompileDecision` 里已经同时包含：

- `disposition`
- `topicSlug / topicName`
- `title / summary / keyPoints / tags / confidence / rationale`

这意味着同一个对象同时被当成：

- 批处理守门结果
- topic 路由结果
- 最终知识 section 草稿

这对 `small batch` 是过重语义绑定。

### 2.2 `background_compiler` 仍以“小 batch 直写 topics”作为默认落点

当前 runtime 已真实可跑，这是好事。

但在 `day digest / rolling topic` contract 未冻结前，它继续直接写 `topics/`，会把旧语义持续污染成长期知识真相。

### 2.3 feedback 已起步，但只覆盖 topic/write 语义

当前 `FeedbackEvent` 与 `QualitySnapshot` 已能承接：

- topic confirm / reassign
- reroute inbox
- discard / retained / deleted

但还没有承接：

- day digest thread 级纠错
- rolling merge 级纠错
- attention hint 是否真的帮到了静默 lane

### 2.4 AI Ops 能看 runtime，但还看不到语义层收敛状态

当前 snapshot 可以看：

- runtime status
- recent jobs
- recent writes
- feedback / quality

但还不能回答：

- 今天恢复出了哪些 thread
- 哪些 thread 还只是待确认线索
- 最近几天哪些主题正在收敛

### 2.5 replay 与 live runtime 还缺少中层 contract

当前 replay 已经能评 batch-level compile。

但如果没有 `DayDigest` 与 `RollingTopic` 的中层对象，`real-history replay` 与 live runtime 之间仍然会断一层，导致：

- replay 在评 day-level
- live runtime 还在写 batch-level

两边无法共享同一套质量口径。

## 3. 优化原则

### 3.1 不做一次性重写，只做分层迁移

保留已有可用资产：

- `BatchCompileJob`
- `AiSystemSnapshot`
- `_system/ai/runtime.json`
- `jobs/*.json`
- `writes.jsonl`
- `feedback_store`
- `preview_ai_batch_compile`
- `ai-quality replay`

但改变它们的解释权。

### 3.2 先降级旧语义，再引入高层语义

顺序必须是：

1. 先把 `small batch -> direct topic write` 降级
2. 再补 `day digest`
3. 再补 `rolling topic`
4. 最后再恢复正式知识层 live write

反过来做，只会把旧错误写得更深。

### 3.3 新层必须由 Rust 持有权威状态

- `day digest`
- `rolling topic`
- `final write gating`

都必须是 Rust-owned contract，而不是先在 Renderer 里做 view-model 原型后再倒灌回去。

### 3.4 显式 lane 只能施加偏置，不能夺权

`attention hint` 可以影响：

- 召回
- 排序
- merge 优先级
- 待确认建议

但不能直接决定：

- topic 是否新建
- 原始证据是否被改写
- 低置信内容是否被强行送入知识层

## 4. 建议的链路重构

### 4.1 保留现有 `BatchCompileJob`，但把它解释为 `Triage Job`

建议不立即废弃 `BatchCompileJob`。

它仍保留为：

- 调度与重试单位
- provider capability 的调用单位
- runtime audit / replay 对齐单位

但它不再自动等于最终知识判断单位。

### 4.2 在 triage 与最终写入之间新增两个 Rust-owned 层

新增：

1. `DayDigest`
2. `RollingTopic`

新的静默主链路改为：

```text
CaptureRecord
  -> Triage Job
  -> Triage Candidates
  -> Day Digest
  -> Rolling Topic
  -> Final Knowledge Write
```

### 4.3 最终写入权只留给 `Final Knowledge Write`

`topics/` / `_inbox/` 的正式写入，不再由 triage 结果直接触发。

Triage 只能产出：

- 候选 thread
- 候选 topic 复用线索
- discard / inbox 倾向
- 局部摘要草稿

真正的高置信写入，应由 `RollingTopic` 或经 `DayDigest` 校准后的 gate 做最终裁决。

## 5. 推荐对象模型

本节是推荐 contract，不等于今天必须一次性全做完。

### 5.1 保留对象

| 对象 | 继续保留的角色 |
| --- | --- |
| `BatchCompileJob` | triage job、调度单位、失败重试单位、replay artifact 主键 |
| `BatchCompileInput` | triage 输入快照 |
| `FeedbackEvent` | 通用纠错与行为事件入口 |
| `QualitySnapshot` | AI 质量快照 |
| `AiSystemSnapshot` | AI Ops 总览入口 |

### 5.2 新增对象

| 对象 | 建议职责 | 备注 |
| --- | --- | --- |
| `TriageCandidate` | 表达某一批里可继续上送的候选 cluster / thread hint | 可由现有 `BatchCompileDecision` 归一映射而来 |
| `DayDigestThread` | 某一天内恢复出的 thread 单元 | 第一层真实语义对象 |
| `DayDigestSnapshot` | 某天的 digest 结果、待确认线索、被丢弃说明 | 首个用户可感知静默输出 |
| `RollingTopicCandidate` | 跨日 merge 候选，表达与已有 topic 的关系 | 不等于最终 topic 写入 |
| `RollingTopicDecision` | 对复用 / 分裂 / 新建 / 暂缓的明确判断 | 最终知识写入前一层 |
| `AttentionHintRecord` | 显式 lane 写入的轻量关注信号 | 只允许显式关闭或替换 |
| `KnowledgeCommit` | 最终写入 `topics/` / `_inbox/` 的受控 commit 记录 | 可扩展替代当前直接 write log |

### 5.3 现有 `BatchCompileDecision` 的推荐降级解释

在迁移期间，建议把现有 `BatchCompileDecision` 重解释为：

- `WriteTopic`：高价值候选，默认进入 `TriageCandidate`，不直接等于 live topic write
- `WriteInbox`：低置信候选，可直接转 `_inbox` 候选或保留到 `DayDigest` 再判
- `DiscardNoise`：仍然允许作为 triage 终点

也就是说，`WriteTopic` 在迁移期默认应被理解为：

> 候选知识线索，而不是已被证明正确的最终 topic section

## 6. 推荐存储分层

### 6.1 知识根目录下的 Rust runtime 资产

推荐新增但暂不冻结的路径草案：

```text
_system/
  ai/
    runtime.json
    jobs/
    writes.jsonl
    job-audit.jsonl
    triage/
      YYYY-MM-DD/
        *.json
    day-digests/
      YYYY-MM-DD.json
    rolling-topics/
      *.json
```

说明：

- `triage/`：保存批处理降级后的候选结果，供 replay 与 day digest 共用
- `day-digests/`：保存某天的静默语义快照
- `rolling-topics/`：保存跨日 merge 的中间态与候选决策

### 6.2 应用稳定持久化目录下的 SQLite

继续放在 `ai-memory.db` 或同级 app-local DB 的内容：

- `feedback events`
- `quality snapshots`
- `attention hints`
- `digest / rolling feedback`
- `topic usage / retention projection`

原因：

- 这些内容属于运行态记忆和偏好，不属于知识根目录真相源
- 这也符合当前冻结文档里“feedback / quality / preference 在 app storage”这一判断

## 7. 模块落点建议

### 7.1 当前模块继续保留

- `src-tauri/src/ai/background_compiler.rs`
- `src-tauri/src/ai/provider_compile.rs`
- `src-tauri/src/ai/knowledge_writer.rs`
- `src-tauri/src/ai/system.rs`
- `src-tauri/src/ai/feedback_store.rs`

### 7.2 推荐新增模块

- `src-tauri/src/ai/triage_store.rs`
- `src-tauri/src/ai/day_digest.rs`
- `src-tauri/src/ai/day_digest_store.rs`
- `src-tauri/src/ai/rolling_topic.rs`
- `src-tauri/src/ai/rolling_topic_store.rs`
- `src-tauri/src/ai/attention_hint_store.rs`

### 7.3 模块职责建议

`background_compiler.rs`：

- 继续做调度、重试、状态迁移
- 不继续承担“最终 topic write 的唯一驱动者”语义

`provider_compile.rs`：

- 继续做 capability 调用与低层 guard
- 输出 triage-level 结果，不直接定义长期知识真相

`knowledge_writer.rs`：

- 收敛成最终知识输出层
- 不再默认接受所有 triage job 的直接落盘请求

`system.rs`：

- 在后续版本里增加 `day digest / rolling topic` 的 snapshot 汇总
- 让 AI Ops 能观察语义层，不只观察 job 层

`feedback_store.rs`：

- 扩展 digest / rolling / hint feedback
- 不只统计 topic 级纠错

## 8. 迁移顺序

### Phase 0. 先加写入闸门

第一步不是新增 day digest，而是先把旧语义锁住。

建议新增一个 Rust-owned write mode：

- `legacy_live`
- `sandbox_only`
- `digest_gated`

默认建议尽快从 `legacy_live` 切到 `sandbox_only` 或 `digest_gated`。

### Phase 1. 把现有 batch 产物落成 `TriageCandidate`

复用当前：

- `BatchCompileJob`
- `provider_compile`
- `preview_ai_batch_compile`
- `background replay`

但新增：

- triage 持久化
- triage artifact 归档
- triage 到 digest 的读取入口

### Phase 2. 冻结 `DayDigest` contract

先只做 single-day：

- 输入：某日 `daily`、相关 triage candidates、必要 topic index、必要 attention hint
- 输出：`threads`、`tentative_leads`、`discarded_noise_projection`

此阶段不要先碰 cross-day merge。

### Phase 3. 接上真实历史 replay 与 benchmark

把 `2-3` 天手工标注结果接到：

- `single-day replay`
- `multi-day replay`
- scorer / report

要求 replay 与 live runtime 共用：

- triage artifacts
- day digest contract
- rolling topic contract

### Phase 4. 接最小用户可感知面

先展示：

- 今天主要 thread
- 待确认线索
- 最近 1-3 条主题变化

同时只给轻量反馈动作：

- 有用
- 噪音
- 方向不对

### Phase 5. 再引入 `RollingTopic`

只有在 `DayDigest` 稳定后，才做跨日 merge。

此阶段才允许恢复更高置信的 live topic write。

## 9. 质量指标怎么升级

### 9.1 继续保留当前指标

- `correction_rate`
- `topic_confirmed_count`
- `topic_reassigned_count`
- `inbox_reroute_count`

### 9.2 新增静默语义层指标

- `useful_thread_recall`
- `daily_thread_coherence`
- `false_knowledge_intrusion`
- `cross_day_topic_stability`
- `hint_utilization_quality`
- `tentative_lead_resolution_rate`

### 9.3 推荐 gating 规则

在 `RollingTopic` 正式 live write 前，至少满足：

1. `single-day replay` 已接通真实历史标注
2. `false_knowledge_intrusion` 不高于当前 batch live baseline
3. `daily_thread_coherence` 与 `useful_thread_recall` 已出现连续稳定改进
4. 用户可感知摘要面已经能承接最小纠错动作

如果这些条件不满足，就不应恢复 live `topics/` 写入。

## 10. `attention hint` 的最小接法

### 10.1 第一版只做单活 hint

建议第一版只允许：

- 当前 active hint 一条
- 显式关闭
- 显式替换

不做：

- TTL 自动衰减
- 多条 hint 打分融合
- 长期用户画像

### 10.2 hint 的消费位置

只允许影响：

- triage 之后的 digest 排序
- rolling merge 时的候选优先级
- dashboard / 首页的待确认线索排序

不允许影响：

- raw evidence
- discard safety gate
- 最终 topic 正确性的硬门槛

## 11. 近期最值得直接开做的 8 项任务

1. 在 Rust runtime 增加 direct write gate，把 `small batch -> topics` 先降级到 `sandbox_only`
2. 基于本机真实历史先手工标注 `2-3` 天 `DayDigest / RollingTopic` 基准
3. 为当前 `BatchCompileDecision` 增加 triage-level 映射层，而不是继续让它直通知识写入
4. 新建 `triage_store`，把现有 background compile 的结果沉成可 replay 的中间资产
5. 冻结 `DayDigestSnapshot` 与 `DayDigestThread` 的 Rust contract
6. 把 `single-day replay` 接到新 contract，而不是只跑 batch-level scorer
7. 扩展 `feedback_store`，增加 digest / rolling / hint 的 feedback 事件
8. 在 dashboard 或首页补一个最小静默摘要区，先承接 day digest，不先做完整 AI Ops 页面

## 12. 这轮明确不做什么

- 不把 `BatchCompileJob` 直接删掉重来
- 不先做跨日 merge 再补 day digest
- 不让 Renderer 先发明一套 day digest 状态机再倒灌给 Rust
- 不把 `attention hint` 做成推荐系统
- 不在 replay 没跑通前恢复旧的小 batch live topic write

## 13. 一句结论

下一阶段最正确的做法，不是继续把 `provider-backed background compile` 调得更像“会写 topic 的小批处理器”，而是把它稳稳降级为 `triage engine`，再在 Rust 上补齐 `day digest`、`rolling topic`、`final write gating` 和 `attention hint` 这几层。只有这样，现有 runtime、replay、feedback 与用户可感知输出才会开始共用同一套语义。
