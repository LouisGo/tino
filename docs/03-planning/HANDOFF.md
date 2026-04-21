# Tino Handoff

> 最后更新：2026-04-21
> 当前基线提交：`d4e2c7e`
> 角色：短版 current-state 控制文档
> 原则：只写当前有效信息；旧 AI 过渡方案不再在这里保留双轨表述

## 1. 先读什么

必读：

1. `AGENTS.md`
2. `docs/03-planning/技术冻结记录.md`
3. `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
4. `docs/03-planning/Tino AI 静默编译与显式意图执行方案 v0.1.md`
5. 本文

按任务再读：

- 当前 AI 质量闭环与 replay 计划：`docs/03-planning/Tino AI 开发期质量管线计划 v0.1.md`
- 打包、环境、签名：`docs/03-planning/环境与打包流程.md`
- 产品目标与 AI 能力边界：`docs/02-product/个人信息流软件需求原型文档.md`、`docs/02-product/Tino AI 能力地图 v0.2.md`
- legacy `/ai` / review 资产说明只在排查历史实现时阅读，且统一去 `docs/03-planning/archive/`

## 2. 项目一句话

`Tino` 是一个运行在 `macOS` 上的个人信息流入口层工具：  
低摩擦收集用户输入，先做原始归档，再由后台 AI 编译成 `topics/`、`_inbox/` 等知识结果，最终以 `Markdown` 落盘给 Obsidian / 思源等系统使用。

## 3. 当前真实状态

- `M0/M1/M2/M3/M4` 输入与原始归档链路已真实跑通
- AI 开发基线已从旧的 `/ai review` 过渡方案切换到 `AI rethink / background compiler reset`
- 旧 `Minimal LLM Link / Manual Persistence Bridge` 只保留为现存代码资产说明，不再作为后续开发目标

当前已真实存在：

- Rust 剪贴板轮询、`CaptureRecord`、`daily/*.md` 原始归档
- clipboard history 稳定 app storage root、sqlite + JSONL fallback、90 天缓存保留上限
- clipboard 搜索、过滤、暂停采集、link enrich、paste-back、窗口 bootstrap 等主体验已基本收口
- settings / dashboard 的真实 Rust 持久化与 authoritative 同步
- Runtime Provider 多配置 CRUD、当前启用项切换、smoke test
- Renderer 侧交互式 provider access layer 与首页即时 AI 调用入口
- 首页 `HomeChatWorkspace` 已升级为可复用组件：支持多会话、SQLite 持久化、首问后建会话、首条消息异步生成标题
- 首页 chat 视觉与交互基线已调整为 Gemini-like 双态：空态沿用原首页 banner / background 语义，首问后 composer 沉底，消息流与 reasoning 展示在上方
- 首页 `HomeChatWorkspace` 现在是当前默认的交互式 AI 入口，但它不是后台编译 runtime 或 AI Ops 状态的真相源
- Phase A contract reset 已起步：Rust-owned `AiSystemSnapshot` / `BatchCompile*` / `FeedbackEvent` / `QualitySnapshot` IPC 类型
- 应用稳定持久化目录下的 `ai-memory.db` 已建立，用于 feedback event 与 quality snapshot 的本地 SQLite 骨架
- `get_ai_system_snapshot` / `record_ai_feedback_event` 已存在，用于后续 AI Ops 与纠错回路接线
- Phase B storage reset 已起步：`_system/ai/runtime.json`、`_system/ai/jobs/*.json`、`_system/ai/writes.jsonl`、`_system/ai/job-audit.jsonl` 路径已冻结
- 正式 `topic-index.json` 资产已建立，当前读取会优先走该资产而不是长期依赖扫 `topics/`
- legacy `applyBatchDecision` 持久化路径现在会顺手回填 `topic-index`、compile job snapshot、write log、job audit
- Phase C capability boundary 已起步：background compile 的 batch 读取、topic index 读取、能力解析已从 legacy `/ai review` 语义中独立出来，当前支持 provider-backed compile source
- `preview_ai_batch_compile` 已存在，并与 Rust background compile 共用同一条 provider-backed capability path
- Phase D Rust background compiler 已接上：会在启动、batch promotion、周期维护后自动挑选 ready batch、通过 active provider profile 真实调用模型、落盘到 `topics/` / `_inbox/`
- 上述 provider-backed background compile 证明了 Rust 主链路已跑通，但它当前仍带着“小 batch 直接落库”的过渡语义，不等于 `Day Digest / Rolling Topic` 已被证明正确
- DeepSeek 背景编译当前采用 batch 复杂度选模：简单批次走 `deepseek-chat`，复杂批次走 `deepseek-reasoner`
- AI 融合与边界收敛执行已启动：legacy `/ai review` Rust bridge 已从 `commands/ai.rs` 下沉到 `src-tauri/src/ai/legacy_review.rs`
- Runtime Provider 配置现在由 Rust authoritative save path 做最终校验：保存设置时会拒绝 `非 HTTPS baseUrl`、`带 credentials 的 baseUrl`、`model 内空白`、`apiKey 内空白`、`过短 apiKey`
- Background compile capability 对 active provider 的可用性判断已切到与 Rust provider 校验同一套标准，Renderer 表单校验只保留为 UX 层，不再是唯一防线
- 当 active provider 配置无效时，AI capability snapshot 与 background compile refusal 现在会返回 Rust 侧权威失败原因，方便后续 AI Ops 与设置排障直接消费
- Rust background compile 对 provider timeout / non-JSON response 的报错已开始向 Renderer `provider-access` 收敛；当 relay baseUrl 设在根路径时，错误会明确提示尝试补 `/v1`
- Rust background compile 对 DeepSeek 兼容语义的判断现在会吸收显式 `deepseek-* model` 信号，而不是只看 `vendor`；但仅 host 命中 DeepSeek 不会静默替换默认模型，避免后台与交互式配置语义再次漂移
- Renderer 侧 legacy `/ai review` 模块现已整体收敛到 `src/features/ai/legacy-review/`；`ai-review-page.tsx` 仍保留为 legacy tooling surface，但 review-first 逻辑不再占据 `features/ai` 的默认结构中心
- `pnpm ai-quality:replay` 现已显式区分 `--pipeline legacy|background`：`legacy` 继续用于 benchmark / compatibility，`background` 会通过 headless Rust compile 入口直接评测当前 rethink 主链路，但 scorer / goldens / experiment reports 仍保持同一套
- Dashboard 首页现已开始消费 Rust-owned `AiSystemSnapshot`，以次级 `AI Ops` 摘要卡展示后台 runtime 状态、近期写入、feedback 计数与 quality 快照；该面板只消费 snapshot query，不在 Renderer 建立新的权威 runtime 状态
- `aiSystemSnapshot` 的 query invalidation 现已收窄：设置变更只在 `knowledgeRoot` 或当前激活 provider 实际变化时刷新；clipboard 侧 `refreshDashboard` 事件也会同步刷新该 snapshot
- Rust 侧现已新增 `AiSystemUpdated` typed event；后台编译周期完成、feedback 落库成功、legacy review persist 成功后都会发射该事件，Renderer 通过 `AppProviders` 统一失效 `aiSystemSnapshot` query 做热同步
- provider-bound background compile 现在会先做最小本地安全防护：明显 token / credential capture 先本地丢弃，不进入外部模型请求
- provider-bound background compile 现在也会做最小落库质量守门：输出语言跟随当前 `localePreference`，topic 复用时允许保留原 slug 但按当前 locale 更新显示名；单条祝福/鸡汤不直接入 `topic`，明显 OCR 乱码片段直接丢弃
- 后台 compile 的 queue / batch gate 已切到 capability boundary；当前没有可用 provider-backed background capability 时，新 capture 仍会进入 `daily` 原始归档，但不会进入正式 AI queue / batch，AI runtime snapshot 会停在 `AwaitingCapability`
- `_system/ai/runtime.json` 现在会真实记录 `Idle / Running / RetryBackoff` 迁移，`jobs/*.json`、`writes.jsonl`、`job-audit.jsonl` 由后台编译主链路直接写入
- topic / inbox 的 Markdown merge 逻辑已抽成共享 Rust helper，legacy `applyBatchDecision` 与新的后台编译落盘保持同一套文件语义
- `_system/runtime.json`
- `_system/queue.json`
- `_system/batches/*.json`

当前仍存在但已降级为 legacy 过渡资产：

- `/ai` 页面
- renderer 侧 manual live candidate run
- review DTO / `_system/reviews/*.json`
- `applyBatchDecision` 的手动持久化桥接语义
- `pnpm mock:ai-review` 这条 review-first mock 链路

当前仍未真实存在：

- 接到真实用户纠错路径的 feedback memory 回路
- 后台 compile 成功/失败驱动的正式 quality metrics 流
- 历史补跑
- `Day Digest / Rolling Topic` 的正式 contract 与用户可感知输出入口

本轮已形成、但尚未完成代码落地的 next-stage 共识：

- 进入真实历史 replay 前，先手工标注 `2-3` 天真实剪贴板历史，定义理想的 `Day Digest / Rolling Topic`
- 当前 `20 条 / 10 分钟` 只应继续作为 queue promotion / triage 的调度窗口，不应再被当成最终语义窗口
- `daily/` 仍然只做原始归档；后续真正的语义层应上移到 `day digest / rolling topic` 一类的静默编译层
- 在新 contract 冻结前，旧的小 batch 直写 `topics/` 应暂停、降级为 dev-only，或重定向到审计沙盒
- AI 主脑应拆成 `静默 lane` 与 `显式 lane`：默认是后台静默分析，用户显式输入或显式方向只提供注意力锚点
- `attention hint` 第一版只允许显式关闭或被新的 hint 替换，不做自动衰减
- 后续文件拖入不应做成另一个 AI 孤岛，而应作为统一 `input adapter` 接入同一条静默编译主链路
- 上述口径的完整描述见：`Tino AI 静默编译与显式意图执行方案 v0.1`

## 4. 当前 AI 相关旧资产必须这样理解

- `/ai` 页面不是主产品路径，也不是当前 AI 模块设计中心
- `/ai` 页面可以被推翻或重做
- `applyBatchDecision` 现在只是 legacy 手动受控持久化命令
- provider settings 可以保留，但只是能力配置入口，不是 AI 架构中心
- 当前如果代码里还存在 review-first 语义，应视为迁移中的旧实现，而不是未来方向

## 5. 不要漂移的边界

应用形态：

- 常驻后台
- `menubar / tray + Dock + 主窗口`
- 主窗口关闭只 `hide`

职责分层：

- 剪贴板轮询：`Rust`
- 本地文件读写：`Rust`
- 交互式 AI：`Renderer`
- 后台 AI 编译 runtime：`Rust async runtime`
- 真实副作用：`Rust`
- 反馈记忆与质量指标：`SQLite + Rust`
- 运行态与审计：`_system/ JSON` + 必要的本地 SQLite

数据边界：

- clipboard history 是输入插件缓存，不是长期知识真相源
- `daily/` 只做原始归档
- `topics/` / `_inbox/` 是 AI 知识层输出
- AI 不直接控制真实文件路径
- provider 配置与敏感能力配置放应用稳定持久化目录
- feedback / quality / preference store 也应放应用稳定持久化目录，不放知识根目录

AI 策略：

- 主路径是 `静默输入 -> 后台编译 -> 结果呈现`
- review / 调试只作为异常兜底与开发校准层
- 分层按触发频率与生命周期，而不是按模型强弱
- 后台编译和交互式 AI 必须物理隔离
- `20 条 / 10 分钟` 是调度窗口，不是最终语义窗口
- `daily/` 之上应逐步形成日级与跨日的静默 thread / topic 收敛层
- 用户显式给方向时，应优先落到轻量 `attention hint`，而不是直接改写静默编译真相
- `attention hint` 在 `v0.1` 里只允许显式关闭或替换，不做自动衰减
- 后续文件拖入、文档导入、富媒体输入都应被理解为统一输入适配器，而不是独立 AI 岛
- 静默系统必须提供用户可感知摘要出口，而不是只在后台或 AI Ops 中自转

## 6. 默认开发顺序

如果做输入链路：

- 优先剪贴板体验、过滤质量、暂停语义、最近状态可见性

如果做 AI：

- `手工标注 2-3 天真实历史 -> 暂停旧直写 topics 语义 -> 真实历史回放 -> triage batch 收敛 -> day digest / rolling topic contract -> attention hint -> input adapter`
- 在上述主线内继续推进 `Contract -> Storage / Feedback -> Capability Boundary -> Rust Background Compiler -> Persistence -> AI Ops`
- 不要先继续写 `/ai` 页面
- 不要把 provider UI 当成 AI 模块中心
- 不要在 Rust 状态机和反馈存储没定之前先扩 AI UI

## 7. 常用命令

```bash
pnpm install
pnpm check
pnpm build
pnpm tauri dev
pnpm mock:ai-review run --profile preview --count 20
```

说明：

- `pnpm mock:ai-review` 仍可用于 legacy `/ai` 与 batch 文件调试，但不代表新的 AI 主链路

如果只做 Rust 校验：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 8. 维护规则

每次 AI 阶段变化，至少同步更新：

- `最后更新`
- `当前基线提交`
- `当前真实状态`
- `docs/03-planning/技术冻结记录.md`
- `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
- `Tino AI 静默编译与显式意图执行方案 v0.1`

如果只是排查 legacy `/ai` 行为，再额外参考：

- `docs/03-planning/archive/AI Review 当前实现与 Mock 链路说明.md`

## 9. 一句结论

当前仓库的正确理解不是“AI 已经接完”，而是：

> 输入侧和原始归档链路已经真实可用；Rust-owned background compiler 也已真实接上；下一阶段的关键不再是继续围绕小 batch 直接落库做优化，而是把 AI 主脑收敛到 `静默编译 + day digest / rolling topic + 轻量 attention hint + 输入适配器` 这条主线上。
