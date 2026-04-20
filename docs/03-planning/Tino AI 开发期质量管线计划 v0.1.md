# Tino AI 开发期质量管线计划 v0.1

> 日期：2026-04-20
> 角色：开发阶段 AI 质量闭环执行计划
> 适用范围：mock batch、golden 标注、offline replay、scoring、experiment tracking
> 依赖基线：
> - `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
> - `docs/03-planning/技术冻结记录.md`
> - `docs/03-planning/HANDOFF.md`

## 1. 这份文档解决什么问题

这份文档用于解决当前 Tino AI 开发中的一个核心断层：

- 输入侧、归档侧、批次侧已经基本可跑
- 结构化 AI 候选生成也已经有可运行链路
- 但开发阶段仍然缺少一条系统性的质量管线，无法回答：
  - 这次 prompt / retrieval / routing 改动是否真的更好
  - 哪一类剪贴板场景退化了
  - 哪些错误来自 batch 切分、topic 检索、模型输出还是持久化决策
  - 在没有真实用户反馈规模的情况下，如何把质量闭环先做起来

本文件的目标不是定义新的 AI 产品形态，而是为后续开发提供一条可执行、可比较、可回放、可量化的开发期质量增强路径。

## 2. 当前真实起点

当前仓库已经存在、且可复用的 AI 相关资产：

- Rust capture / queue / batch promotion / runtime snapshot 链路
- `_system/queue.json` / `_system/batches/*.json` / `_system/runtime.json`
- legacy `/ai` 页内的 live structured generation 链路
- renderer 侧 prompt 组装、topic 选择、schema 校验、provider 调用
- Rust 侧 `apply_batch_decision` 受控持久化边界
- `pnpm mock:ai-review` 的近真实 mock queue / batch 注入脚本

当前仍然缺失、且直接阻碍质量改进的能力：

- 开发期固定 benchmark / golden set
- 可回放的 run artifact 持久化
- 离线 scorer 与质量报告
- experiment id / prompt version / retrieval version 的可比较记录
- 正式 feedback / quality SQLite
- Rust-owned background compiler 主链路
- 正式 topic index 资产

因此，当前最迫切的任务不是再接一个新的模型入口，而是先建立开发期质量系统。

## 3. 先冻结的判断

### 3.1 开发阶段不能依赖真实用户反馈起步

开发期默认假设：

- 近期真实用户数据不足以支撑稳定反馈学习
- 不能等待真实用户纠错事件成为质量主驱动
- 必须先通过开发期 mock batch + 人工 golden 标注建立离线质量闭环

### 3.2 第一优先级不是 prose 漂亮，而是 routing 正确

开发期质量排序固定为：

1. 这条内容是否应该进入知识层
2. 这条内容应该去 `discard`、`_inbox` 还是 `topics/`
3. 这条内容应与哪些 source 归成一组
4. 这条内容是否应并入已有 topic，还是新建 topic
5. 在上面都足够稳定之后，才优化标题、摘要、关键点质量

### 3.3 第一版质量管线优先复用现有 TypeScript 运行链路

开发期第一版评测与实验 runner 默认采用：

- 直接复用现有 `live-batch-review.ts`
- 直接复用现有 `provider-access.ts`
- 直接复用现有 `model-output.ts`

原因：

- 避免评测链路与产品链路分叉
- 避免在开发早期复制一套近似但不一致的 prompt / parser / retrieval 逻辑
- 先用最小成本建立真实回归能力

Python 在本计划中的角色见第 `11` 节。

### 3.4 第一版只覆盖剪贴板主链路

v0.1 质量集聚焦：

- `plain_text`
- `rich_text`
- `link`

先不把以下类型作为第一版质量主战场：

- `image`
- `video`
- `file`
- OCR 富媒体复合输入

这些类型可以保留样本占位，但不进入 v0.1 的主要 gating 指标。

## 4. 质量对象分层

开发期质量必须按链路分层，而不是只看最后生成的文章或 section。

### 4.1 Batch Formation

问题：

- 哪些 capture 应该被放在同一批次
- 哪些 capture 应该被保留为未来批次
- 当前按 `20 条 / 10 分钟` 的触发是否把语义会话切碎

### 4.2 Compile Decision

问题：

- 模型是否把 source 正确分 cluster
- cluster 是否做了正确的 destination 路由
- 现有 topic 检索是否给了足够相关的上下文
- 新 topic 与已有 topic 的判断是否可靠

### 4.3 Persistence Semantics

问题：

- 输出是否满足 schema
- 是否存在 source 重复归属
- topic slug / topic name 是否稳定
- 最终 persist 语义是否与预期一致

### 4.4 Section Quality

问题：

- 标题是否可用
- 摘要是否忠于 source
- key points 是否被 source 支撑
- “why it landed here” 是否有解释价值

## 5. v0.1 交付物

本计划要求至少交付以下 5 个资产。

### D1. 开发期 Mock Batch 语料集

目标：

- 形成一批足够像真实剪贴板流的批次样本
- 覆盖常见场景、噪声、模糊边界、topic 冲突与低价值输入

### D2. Golden 标注集

目标：

- 给每个 batch 提供可比较的正确答案
- 重点标 destination、clustering、topic merge/new-topic
- 暂不要求逐字级摘要标准答案

### D3. Headless Replay Runner

目标：

- 以无 UI 方式跑一整套 fixtures
- 记录 prompt、selected topics、raw model output、parsed output、persist dry-run 结果

### D4. Scorer 与质量报告

目标：

- 对每次 run 输出统一 scorecard
- 区分 critical metrics 与 secondary metrics
- 支持与上一轮实验直接 diff

### D5. Experiment Registry

目标：

- 给每次试验一个唯一 id
- 记录 prompt 版本、retrieval 版本、模型配置、schema 版本、runner 版本
- 确保未来 A/B 对比有严格输入输出归档

## 6. Mock Batch 数据集计划

### 6.1 数据集构建原则

开发期 mock batch 必须满足以下原则：

- 不是“随机文本拼盘”，而是“像真实任务流的 clipboard 微会话”
- 不是完全由 LLM 自动生成，而是“人工策划场景 + 人工审校文本 + 必要时辅助改写”
- 保留剪贴板特征：
  - 连续复制
  - 中断式复制
  - 同一任务内不同 app 切换
  - 链接与正文混杂
  - 局部片段、标题、列表项、短笔记并存
  - 噪声、重复、低价值、疑似应 discard 的内容存在

### 6.2 场景族

v0.1 至少覆盖以下 `10` 类场景族：

1. `focused_research`
   说明：围绕单一主题连续复制资料、摘录、链接与短评。

2. `coding_debugging`
   说明：报错、代码片段、命令、issue 注释、修复思路混合出现。

3. `writing_planning`
   说明：文档写作、产品规划、任务拆解、待办片段、标题草稿连续出现。

4. `meeting_chat_actionables`
   说明：聊天、会议纪要、行动项、共识句子、半结构化列表交错出现。

5. `link_led_context_sparse`
   说明：链接很多，正文很少，容易误归档或误高置信。

6. `topic_overlap_ambiguous`
   说明：两个相邻 topic 词汇重叠，容易错并。

7. `task_switching_interruptions`
   说明：两个任务来回切换，批次内混入不相关片段。

8. `duplicate_and_near_duplicate`
   说明：同一句复制多次、轻微改写、同源重复摘录。

9. `low_value_noise`
   说明：短句、临时片段、无长期价值提醒、应进 discard 或 daily-only 的内容。

10. `bilingual_or_mixed_language`
    说明：中英混杂、术语中英切换、同 topic 多语言表达。

### 6.3 v0.1 规模目标

第一版数据集目标：

- 总批次数：`60`
- 开发集：`45`
- 保留测试集：`15`
- 单批 capture 数：`4 - 12`
- 总 capture 数目标：`420 - 540`

分布要求：

- 至少 `20%` 批次应包含 `link`
- 至少 `20%` 批次应包含 `rich_text`
- 至少 `25%` 批次应包含应进 `_inbox` 的 cluster
- 至少 `15%` 批次应包含应 `discard` 的 cluster
- 至少 `25%` 批次应包含 topic overlap 或 reroute 风险

### 6.4 批次构成规则

每个 batch fixture 必须包含：

- `batch metadata`
- `captures`
- `available_topics`
- `scenario_family`
- `difficulty`
- `notes`

每个 capture 至少包含：

- `id`
- `contentKind`
- `source`
- `sourceAppName`
- `capturedAt`
- `rawText`
- `rawRich`
- `rawRichFormat`
- `linkUrl`

### 6.5 初始目录规划

后续数据集资产默认落到：

```text
fixtures/
  ai-quality/
    README.md
    manifests/
      dataset.v0.1.json
    batches/
      dev/
      holdout/
    topics/
      topic-index.v0.1.json
```

说明：

- `batches/dev/`：允许 prompt 调优期间反复跑
- `batches/holdout/`：禁止在 prompt 改写时逐题针对性修补
- `topics/topic-index.v0.1.json`：固定供 replay runner 使用的 topic 上下文快照

## 7. Golden 标注计划

### 7.1 Golden 的职责

golden 不负责给出“唯一的优美文章”，而负责给出“可比的正确结构”。

v0.1 golden 主要标注：

- cluster 划分
- 每个 cluster 的 destination
- 是否并入 existing topic
- 如果并入，应该并到哪个 topic
- 如果新建，给出建议 topic key
- 哪些 source 明确应 discard
- 哪些 batch 属于高歧义样本

### 7.2 v0.1 Golden 结构

每个 batch 对应一个 golden 文件，至少包含：

- `batchId`
- `fixtureVersion`
- `scenarioFamily`
- `difficulty`
- `expectedClusters`
- `criticalChecks`
- `annotationNotes`

每个 `expectedCluster` 至少包含：

- `clusterId`
- `sourceIds`
- `expectedDestination`
- `topicMode`
  - `existing_topic`
  - `new_topic`
  - `inbox`
  - `discard`
- `expectedTopicSlug`
- `expectedTopicName`
- `mustSupport`
  说明：这一 cluster 的摘要至少应覆盖的事实点列表
- `severity`
  说明：错判的严重程度

### 7.3 v0.1 不做的标注

以下内容不作为第一版强制 golden：

- 完整逐字摘要标准答案
- 完整逐字标题标准答案
- 完整自然语言 reason 文案模板

原因：

- 第一版先保证结构决策正确
- prose 细节允许多解
- 过早把文字风格写死会妨碍前期模型与 prompt 迭代

### 7.4 标注规则

golden 标注必须遵守：

- 由人完成最终判断
- 不允许直接把模型第一次输出当 golden
- topic merge / new topic 的判断必须写注释
- 高歧义样本必须明确标记 `difficulty=hard`

## 8. Replay Runner 与 Run Artifact 计划

### 8.1 Runner 原则

headless runner 必须：

- 复用现有产品级 prompt 组装逻辑
- 复用现有产品级 parser / validator
- 不触碰真实用户 knowledge root
- 能在 disposable sandbox root 中完成 dry-run persist

### 8.2 每次 run 必须记录的 artifact

每次 experiment run 至少输出：

- `experiment_id`
- `run_id`
- `fixture_id`
- `fixture_checksum`
- `model`
- `provider`
- `prompt_version`
- `retrieval_version`
- `schema_version`
- `runner_version`
- `selected_topics`
- `prompt_text`
- `provider_metadata`
- `raw_response_text`
- `parsed_review`
- `validation_errors`
- `persist_dry_run_result`
- `scoring_result`
- `created_at`

### 8.3 目录规划

后续 run artifact 默认落到：

```text
fixtures/
  ai-quality/
    experiments/
      exp-YYYYMMDD-001/
        manifest.json
        runs/
          *.json
        reports/
          summary.json
          summary.md
```

### 8.4 Persist 策略

开发期 replay 默认分两种模式：

- `parse_only`
  只跑生成、解析、schema 和 scorer，不做 persist
- `persist_dry_run`
  在 sandbox knowledge root 中执行受控持久化，并记录输出路径、slug、section 结构

不允许：

- 在 replay 中直接写用户真实知识根目录
- 在没有 artifact 归档的情况下做临时实验

## 9. 评分体系计划

### 9.1 Critical Metrics

以下指标为第一优先级，不允许模糊处理：

1. `schema_valid_rate`
   定义：返回结果通过 schema 与 batch consistency 校验的比例

2. `source_assignment_integrity`
   定义：source 是否存在未知引用、重复归属、漏归属

3. `destination_accuracy`
   定义：`topic / inbox / discard` 路由正确率

4. `false_archive_rate`
   定义：本不该进知识层却被送入 `topic` 的比例

5. `topic_merge_accuracy`
   定义：应并已有 topic 的样本中，并入目标是否正确

6. `new_topic_precision`
   定义：被判为 new topic 的 cluster 中，真正应该新建的比例

7. `cluster_pairwise_f1`
   定义：从 source 配对角度衡量 clustering 是否把该分开的混在一起、该合在一起的拆开

8. `persist_semantic_correctness`
   定义：最终 dry-run persist 目的地、slug、topic name 是否与 golden 一致

### 9.2 Secondary Metrics

以下指标重要，但不作为第一版单独放行条件：

- summary support coverage
- key point support coverage
- title usefulness
- reason helpfulness
- token cost
- latency

### 9.3 开发期总分建议

v0.1 采用加权总分，但总分只作为排序参考，不作为唯一准入条件。

建议权重：

- `40%` routing
- `25%` clustering
- `20%` topic merge / new topic
- `10%` persist semantics
- `5%` section quality

### 9.4 放行阈值

在第一版质量门中，任何实验要进入下一轮默认 baseline，至少满足：

- `schema_valid_rate >= 98%`
- `source_assignment_integrity = 100%`
- `false_archive_rate <= 5%`
- `destination_accuracy >= 85%` on dev set
- `topic_merge_accuracy >= 80%` on dev set
- holdout set 不允许 critical metrics 明显回退

如果总分上升但 critical metrics 下降，则该实验不晋级。

## 10. 开发顺序

### Phase 1. Fixture Corpus Freeze

目标：

- 建立 `60` 个 batch fixture
- 建立固定 topic index fixture
- 冻结 v0.1 数据集 manifest

完成标准：

- 每个 fixture 有场景标签和难度标签
- dev / holdout 分离完成

### Phase 2. Golden Annotation Freeze

目标：

- 完成所有 batch 的结构化 golden 标注

完成标准：

- 所有 batch 具备 cluster / destination / topic decision 正解
- hard cases 有清晰标注说明

### Phase 3. Headless Replay Runner

目标：

- 用无 UI 方式批量跑现有 AI 生成链路

完成标准：

- 能一键跑完整个 dev set
- 能输出统一 run artifacts

### Phase 4. Scorer 与 Report

目标：

- 生成机器可读和人可读的质量报告

完成标准：

- 每轮实验都有 `summary.json` 与 `summary.md`
- 能列出 regressions、top failures、case-by-case diff

### Phase 5. Experiment Loop

目标：

- 允许对 prompt、topic retrieval、batch routing 规则做严格对比

完成标准：

- 每次实验必须有唯一 `experiment_id`
- 每次实验都能与 baseline 做差异比较

### Phase 6. Contract Hardening

目标：

- 把第一轮评测中暴露出的 contract 缺口补齐

优先候选：

- topic index 正式资产
- run artifact 持久化能力
- persist dry-run 支持
- prose support evidence 结构

## 11. Python 使用策略

本计划不禁止 Python，但冻结如下策略：

### 11.1 v0.1 默认选择

v0.1 质量管线默认使用 `TypeScript / Node`，原因：

- 直接复用现有 `live-batch-review.ts`
- 直接复用现有 `provider-access.ts`
- 直接复用现有 schema 和校验逻辑
- 避免在开发早期出现“产品链路”和“评测链路”两套实现漂移

### 11.2 Python 的适用位置

Python 在后续阶段适合承担：

- 误差聚类分析
- 更复杂的统计分析
- notebook 式探索
- reranker / embedding / clustering 实验
- 报告生成增强

### 11.3 Python 的前置条件

只有在以下条件满足后，才建议引入 Python sidecar 或分析层：

- fixture / golden / artifact contract 已冻结
- TS runner 已经能稳定输出 artifacts
- Python 不复制产品 prompt 组装逻辑
- Python 只消费 artifacts，不成为产品链路的真相源

## 12. 当前代码可直接复用的资产

后续质量管线开发默认优先复用：

- `src/features/ai/runtime/live-batch-review.ts`
- `src/features/ai/schemas/model-output.ts`
- `src/features/ai/lib/provider-access.ts`
- `src-tauri/src/commands/ai.rs`
- `scripts/mock-ai-review-chain.mjs`

这些资产现在的角色不是“未来终态”，但足以支撑开发期第一版离线质量系统。

## 13. v0.1 的退出标准

只有在以下条件全部满足后，才认为 v0.1 质量管线完成：

- mock batch 数据集与 holdout set 冻结
- golden 标注完成
- headless replay 可跑通
- scorecard 与 diff 报告可稳定生成
- 至少完成 `3` 轮可比较实验
- 至少存在一轮实验在 holdout 上优于初始 baseline
- 下一轮 AI 开发不再依赖“凭感觉看结果”

## 14. 这份计划的直接含义

从本文件起，Tino 在开发阶段对 AI 质量的正确理解不是：

> 多接几个模型、多改几轮 prompt、看起来顺一点就算更好了。

而应该是：

> 先建立 mock batch + golden + replay + scoring + experiment 的开发期质量闭环，再推动 prompt、retrieval、state machine 和 background compiler 的真实改进。
