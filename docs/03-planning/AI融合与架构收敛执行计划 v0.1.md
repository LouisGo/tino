# AI 融合与架构收敛执行计划 v0.1

> 日期：2026-04-21
> 状态：执行中
> 主判断：以 `AI rethink` 作为唯一主架构，吸收远程 `HomeChat` / `provider access` / `ai-quality` 资产，但不回退到 `review-first`

## 1. 目标架构

唯一主边界：

- `Rust` 持有 `background compiler`
- `Rust` 持有 IPC contract、持久化、反馈记忆、运行态与审计
- `Renderer` 持有 `interactive AI` 与 `HomeChat`
- legacy `/ai review`、`batch-review-engine`、`ai-quality replay` 降级为 `tooling / benchmark / compatibility bridge`

不再接受的漂移：

- 让 `/ai review` 重新成为 AI 产品主路径
- 让 `commands/*.rs` 承担 feature home 角色
- 让 Renderer 成为后台 runtime 真相源
- 让 Rust provider path 与 Renderer provider path 长期双轨漂移

## 2. 收敛原则

1. 远程新增的 `HomeChat` 与 `provider access` 保留，但不改变 rethink 的责任划分。
2. 新增或重构的 IPC 一律按 `Query / State Command / Action Command / Subscription` 分类。
3. `commands/*.rs` 只保留 command signature、轻量校验与转发。
4. Rust-owned IPC 类型不在 Renderer 手写镜像。
5. legacy review 资产允许保留，但必须显式标注为过渡或调试用途。

## 3. 执行阶段

### Phase 0. 口径冻结

状态：已完成

- [x] 选定 `rethink` 作为主架构
- [x] 完成远程 `ff92818` 与本地 rethink 工作区的初次内容融合
- [x] 执行计划文档落盘并纳入 `HANDOFF`
- [x] 更新 `技术冻结记录` 与当前执行文档口径

### Phase 1. Rust 边界收敛

状态：进行中

- [x] 将 `src-tauri/src/commands/ai.rs` 收敛为 IPC adapter
- [x] 抽离 legacy review DTO / 持久化桥接 / Markdown 写入桥到 `src-tauri/src/ai/legacy_review.rs`
- [~] 明确 `ai_ops`、`background compiler`、`topic index`、`knowledge writer`、`feedback store` 依赖方向

### Phase 2. Capability 抽象统一

状态：进行中

- [~] 对齐 Renderer `provider-access` 与 Rust `provider_compile` 的配置语义
- [~] 对齐模型选择、超时、错误模型、能力可用性表达
- [ ] 明确哪些能力只允许 Renderer 用，哪些允许 Background Compiler 用

### Phase 3. Legacy Review 降级

状态：进行中

- [~] 将 `batch-review-engine` 与 `ai-quality replay` 明确收敛为 benchmark/tooling
- [~] 不再让 review DTO 成为主产品语义中心
- [ ] 把 legacy bridge 与主 runtime 的共享逻辑统一到 Rust helper

### Phase 4. AI Ops 补齐

状态：进行中

- [x] 提供 Rust-owned snapshot 查询
- [ ] 提供 typed event / subscription
- [~] 让 Renderer 可消费 runtime、job、write log、feedback、quality 信息

### Phase 5. 文档与验证收口

状态：持续进行

- [ ] 同步 `HANDOFF.md`
- [x] 同步 `技术冻结记录.md`
- [x] 必要时同步 `Tino AI Rethink 与模块开发基线 v1.md`
- [x] 跑 `pnpm gen:bindings`
- [x] 跑 `cargo check`
- [x] 跑 `pnpm typecheck`
- [~] 跑必要测试
- [ ] 重建 `graphify`

## 4. 本轮落地范围

本轮先做：

- 计划文档落盘并纳入 handoff
- `commands/ai.rs` 去 feature-home 化
- 将 legacy review 相关逻辑下沉到 `src-tauri/src/ai/`
- dashboard 接入 Rust-owned `AiSystemSnapshot` 次级 AI Ops 摘要卡
- 同步更新执行状态

本轮先不做：

- 大规模改动 `HomeChat` UI
- 重写 `ai-quality replay`
- 新建完整 AI Ops 页面

## 5. 风险点

- `commands/ai.rs` 继续膨胀会让 Rust 边界再次失真
- provider 抽象双轨会导致未来模型行为与错误处理漂移
- legacy review 资产如果不降级，会持续争夺“主架构解释权”
- 文档如果不与代码同步，会重新形成双轨口径

## 6. 本轮已完成进度

### 2026-04-21

- 已创建本执行计划，并从 `HANDOFF` 加入入口链接
- 已将 `src-tauri/src/commands/ai.rs` 压缩为纯 IPC adapter
- 已新增 `src-tauri/src/ai/legacy_review.rs` 承接 legacy review DTO、bridge 与持久化桥接逻辑
- 已同步 `技术冻结记录` 与 `Tino AI Rethink 与模块开发基线 v1`
- 已通过 `cargo check`、`pnpm gen:bindings`、`pnpm typecheck`
- 已将 `get_topic_index_entries` 从 legacy review surface 挪到 `ai_ops`，收敛其模块归属
- 已新增 `src-tauri/src/ai/ops.rs`，将 `ai_ops` 读写逻辑从 command adapter 下沉到领域模块
- 已将 Runtime Provider 配置校验下沉到 Rust authoritative save path：保存设置时会统一拒绝 `非 HTTPS baseUrl`、`带 credentials 的 baseUrl`、`model 内空白`、`apiKey 内空白`、`过短 apiKey`
- 后台 capability 可用性判断现在与 Rust provider 校验共享同一套标准，避免设置页 UX 校验与 Rust background compiler 长期双轨漂移
- 当 active provider 配置无效时，Rust capability snapshot / compile refusal 现在会直接返回权威失败原因，不再只给泛化的“provider 未配置”文案
- Rust background compile 的 provider 错误语义已开始向 Renderer `provider-access` 收敛：超时与非 JSON 响应现在会返回更明确的配置/兼容性排障文案，并在根路径 relay 场景给出 `/v1` 提示
- Rust background compile 对 DeepSeek 语义的判断不再只依赖 `vendor`：显式 `deepseek-* model` 现在也会触发 DeepSeek 背景编译选模与 capability reason；仅 `host` 指向 DeepSeek 不会偷偷改写默认模型
- Renderer legacy `/ai review` 相关模块已整体重定位到 `src/features/ai/legacy-review/`，将 `review workspace / batch-review-engine / live-batch-review / batch-state-machine / mock-review` 从默认 AI 语义中心降级为显式 legacy tooling
- dashboard 首页现已新增次级 `AI Ops` 摘要卡：通过 `get_ai_system_snapshot` 直接消费 Rust-owned `runtime / recentJobs / recentWrites / latestQualitySnapshot / feedbackEventCount`，但不在 Renderer 建立新的权威 runtime 状态
- `aiSystemSnapshot` 的 renderer query invalidation 已收敛到更窄边界：设置变更只在 `knowledgeRoot` 或当前激活 provider 变化时刷新；clipboard `refreshDashboard` 事件也会联动刷新该 snapshot
- 已补 `src/lib/app-settings-sync.test.ts` 与 `src/features/clipboard/lib/clipboard-capture-sync.test.ts`，覆盖 AI Ops snapshot 的关键 invalidation 语义
- 本轮验证已通过：`pnpm typecheck`、`pnpm test:run src/lib/app-settings-sync.test.ts src/features/clipboard/lib/clipboard-capture-sync.test.ts`、`cargo check --manifest-path src-tauri/Cargo.toml`
- 当前下一步：继续补 AI Ops 的 typed event / subscription，并继续把剩余 `review-first` / `ai-quality replay` 资产压到 tooling / benchmark 语义
