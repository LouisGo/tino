# AI Review 当前实现与 Mock 链路说明

> 日期：2026-04-06
> 适用阶段：`M6 Knowledge Output / Manual Persistence Bridge`

## 1. 这份文档解决什么问题

这份文档用于澄清当前仓库中 `/ai` 页面和相关命令的真实语义，避免后续会话或开发者误判当前 AI 能力已经进入“真实模型执行”阶段。

它重点回答三个问题：

- 当前 `/ai` 页到底真实到哪一步
- `applyBatchDecision` 在当前阶段到底做什么，不做什么
- 如何用一条接近真实数据面的 mock 链路，把 live batch 打进当前 AI review 页面

额外边界：

- 当前 `/ai` 页更接近开发校准与隐藏干预界面，不是普通用户主路径

## 2. 当前 `/ai` 页的真实边界

当前 AI review 能力已经进入手动持久化桥接阶段，可以在隐藏干预面中对 live batch 手动触发一次真实模型调用，并在确认后将结果写入知识层。

当前真实存在的部分：

- Rust 侧已经提供 `ready batch` 读取能力
- Rust 侧已经提供 AI review 相关 IPC DTO
- renderer 侧已经有 AI review 页面
- renderer 侧现在可以对 live batch 手动执行一次 live `generateObject`
- review 提交后会真实写入 `_system/reviews/*.json`
- review 提交后会按程序控制写入 `topics/*.md` 或 `_inbox/YYYY-MM-DD.md`
- review 提交后会把对应 batch 更新为 `persisted`

当前仍未接入的部分：

- 静默后台自动落盘
- 独立正式 topic index 资产
- 历史补跑

因此，当前 `/ai` 页里展示的是：

> preview batch + mock result

或者：

> live batch + renderer 侧 manual live `generateObject` result

同时它应被理解为：

> 当前阶段的隐藏干预 / 调试入口

## 3. `applyBatchDecision` 的当前语义

当前 `applyBatchDecision` 不是“生成 AI 任务”的命令。
它只在用户已经打开 review 页面并提交审阅结果时才会触发。

当前它负责：

- 校验 `batchId` / `reviewId` / `clusterId`
- 校验 cluster 的 `sourceIds` 是否确实来自对应 batch
- 校验 `sourceIds` 不会跨 cluster 重复引用
- 校验 `editedClusterIds` 是否引用了存在的 cluster
- 将 review 与 feedback 写入 `_system/reviews/*.json`
- 按程序控制写入 `topics/*.md` 或 `_inbox/YYYY-MM-DD.md`
- 将 batch 状态更新为 `persisted`

当前它明确不负责：

- 生成 batch
- 调用模型
- 自动静默触发后台编译
- 任意路径写文件

换句话说：

- `queue -> batches/*.json` 才是“任务生成”
- `applyBatchDecision` 是“审阅应用 + 受控持久化”

## 4. 当前 live batch 是怎么产生的

当前批次生成链路仍然沿用真实 orchestrator 规则：

1. capture 先进入 `daily/*.md`
2. 若 AI 已启用，则 capture 同时进入 `_system/queue.json`
3. 队列满足下面任一条件时，被提升为 `_system/batches/*.json`
4. `/ai` 页面读取这些 ready batch

批次触发规则保持不变：

- 满 `20` 条
- 或最晚 `10` 分钟

注意：

- 当前 Rust 侧 `ai_enabled()` 仍只看 `apiKey` 是否为空
- 如果 `apiKey` 为空，新 capture 只会归档到 `daily`，不会进入 AI queue
- 因此 `/ai` 页面不会自动出现 live batch

## 5. Mock 链路的目标

为了验证当前 review 链路、以及在不调用真实模型时复现 live batch 场景，仓库保留了一条“接近真实场景”的 mock 数据链路。

目标不是伪造浏览器内 demo fixture，而是：

- 直接写入真实格式的 `daily/*.md`
- 直接写入真实格式的 `_system/queue.json`
- 按真实批次规则产出 `_system/batches/*.json`
- 让 `/ai` 页面读取到 live batch

## 6. Mock 链路脚本

脚本位置：

- [mock-ai-review-chain.mjs](/Users/louistation/MySpace/Life/tino/scripts/mock-ai-review-chain.mjs)

命令入口：

- `pnpm mock:ai-review`

### 6.1 子命令

支持四个动作：

- `inject`
  - 只注入 mock capture 到 `daily` 与 `queue`
- `promote`
  - 只执行队列提升，生成 batch
- `run`
  - 先 `inject` 再 `promote`
- `status`
  - 查看当前 knowledge root 下的 queue / batch 状态

### 6.2 常用命令

写入当前 preview profile 对应的 knowledge root：

```bash
pnpm mock:ai-review run --profile preview --count 20
```

写入一个自定义 knowledge root：

```bash
pnpm mock:ai-review run --knowledge-root /tmp/tino-ai-review-mock --count 20
```

查看状态：

```bash
pnpm mock:ai-review status --knowledge-root /tmp/tino-ai-review-mock
```

### 6.3 落盘结果

执行后应至少看到这些文件变化：

- `daily/YYYY-MM-DD.md`
- `_system/queue.json`
- `_system/batches/batch_*.json`
- `_system/runtime.json`

## 7. 当前 mock 链路与浏览器 demo fixture 的区别

当前仓库里有两类“假数据”能力：

### A. 浏览器预览 fixture

位置：

- `src/features/ai/lib/mock-fixtures.ts`
- `src/features/ai/lib/mock-review.ts`

用途：

- 仅用于非 Tauri 环境或显式 preview example
- 不写本地知识根目录
- 不生成真实 batch 文件

### B. 文件系统 mock 链路

位置：

- `scripts/mock-ai-review-chain.mjs`

用途：

- 直接写 knowledge root
- 产出真实格式的 queue / batch / runtime 文件
- 用来验证当前 `/ai` 页读取 live batch 的链路

后续做 AI review 验证时，应优先使用 **B**，而不是继续依赖 **A**。

## 8. 当前阶段的正确理解

截至这份文档，当前 AI review 的正确描述应当是：

> Tino 已具备 live batch 的读取、展示、manual live candidate run、审阅提交、review 留痕以及手动受控持久化能力；
> live `generateObject` 当前仍发生在 renderer 侧，`topics/` / `_inbox/` 写入仍必须经过 Rust command；
> `/ai` 当前主要服务校准、抽检与异常干预，而不是普通用户的日常使用主路径；
> 真正尚未接通的是“静默后台自动编译并自动交付”。

如果后续有人说“AI 已经做完了”或者“`applyBatchDecision` 没有生成任务”，都属于对当前实现阶段的误读。
