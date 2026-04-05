# Tino Handoff

> 最后更新：2026-04-05  
> 当前基线提交：`60d430e`  
> 角色：短版 current-state 控制文档  
> 原则：只写当前有效信息；细节用指针跳转，不在这里平铺

## 1. 先读什么

必读：

1. [AGENTS.md](/Users/louistation/MySpace/Life/tino/AGENTS.md)
2. [技术冻结记录](/Users/louistation/MySpace/Life/tino/docs/03-planning/技术冻结记录.md)
3. 本文

按任务再读：

- `/ai` 页、review、mock 链路：  
  [AI Review 当前实现与 Mock 链路说明](/Users/louistation/MySpace/Life/tino/docs/03-planning/AI%20Review%20%E5%BD%93%E5%89%8D%E5%AE%9E%E7%8E%B0%E4%B8%8E%20Mock%20%E9%93%BE%E8%B7%AF%E8%AF%B4%E6%98%8E.md)
- AI runtime 分层、后续 Phase 顺序：  
  [Tino AI Runtime 与 Agent 工程方案 v0.1](/Users/louistation/MySpace/Life/tino/docs/03-planning/Tino%20AI%20Runtime%20%E4%B8%8E%20Agent%20%E5%B7%A5%E7%A8%8B%E6%96%B9%E6%A1%88%20v0.1.md)
- 里程碑与任务拆解：  
  [MVP开发任务拆解](/Users/louistation/MySpace/Life/tino/docs/03-planning/MVP%E5%BC%80%E5%8F%91%E4%BB%BB%E5%8A%A1%E6%8B%86%E8%A7%A3.md)
- 打包、环境、签名：  
  [环境与打包流程](/Users/louistation/MySpace/Life/tino/docs/03-planning/%E7%8E%AF%E5%A2%83%E4%B8%8E%E6%89%93%E5%8C%85%E6%B5%81%E7%A8%8B.md)
- 产品目标与 AI 能力边界：  
  [个人信息流软件需求原型文档](/Users/louistation/MySpace/Life/tino/docs/02-product/个人信息流软件需求原型文档.md)  
  [Tino AI 能力地图 v0.2](/Users/louistation/MySpace/Life/tino/docs/02-product/Tino%20AI%20%E8%83%BD%E5%8A%9B%E5%9C%B0%E5%9B%BE%20v0.2.md)

非必读归档：

- [Handoff 扩展归档 2026-04-05](/Users/louistation/MySpace/Life/tino/docs/03-planning/archive/Handoff%20%E6%89%A9%E5%B1%95%E5%BD%92%E6%A1%A3%202026-04-05.md)

## 2. 项目一句话

`Tino` 是一个运行在 `macOS` 上的个人信息流入口层工具：  
低摩擦收集用户输入，先做原始归档，再用 AI 做批量整理，最终以 `Markdown` 落盘给 Obsidian / 思源等系统使用。

## 3. 当前真实状态

- `M0/M1/M2/M3/M4` 最小真实链路已通
- `M5 AI Pipeline` 已进入 `Phase 1 Contract First`
- `M6 Knowledge Output` 未开始

当前已真实存在：

- Rust 剪贴板轮询
- `CaptureRecord`
- `daily/*.md` 原始归档
- `_system/runtime.json`
- `_system/queue.json`
- `_system/batches/*.json`
- settings / dashboard 的真实 Rust 持久化与读取
- Runtime Provider 表单校验与模型下拉
- settings 页 live provider smoke test
- Renderer 侧 OpenAI-compatible provider access layer
- `/ai` 页读取 live batch
- review 提交写入 `_system/reviews/*.json`

当前仍未真实存在：

- `/ai` 主链路中的真实模型调用
- `/ai` review session 的 live `generateObject`
- `topics/` 写入
- `_inbox/` 写入
- 正式 topic index
- 历史补跑

## 4. 当前 `/ai` 页必须这样理解

- `/ai` 页读取的 batch 可以是 live batch
- 当前排序结果仍是 renderer 侧 `trial sorting pass`
- settings 页的 live provider test 已接真实模型，但 `/ai` 主链路仍未接 live `generateObject`
- `applyBatchDecision` 当前只做审阅应用与留痕，不生成任务
- 若 `apiKey` 为空，capture 只进 `daily`，不进 AI queue

细节说明看：

- [AI Review 当前实现与 Mock 链路说明](/Users/louistation/MySpace/Life/tino/docs/03-planning/AI%20Review%20%E5%BD%93%E5%89%8D%E5%AE%9E%E7%8E%B0%E4%B8%8E%20Mock%20%E9%93%BE%E8%B7%AF%E8%AF%B4%E6%98%8E.md)

## 5. 不要漂移的边界

应用形态：

- 常驻后台
- `menubar / tray + Dock + 主窗口`
- 主窗口关闭只 `hide`

职责分层：

- 剪贴板轮询：`Rust`
- 本地文件读写：`Rust`
- AI 调用：`Renderer`
- Agent runtime / prompt 编排：`Renderer`
- 真实副作用：`Rust command`
- 运行态：`_system/ JSON`

数据边界：

- `daily/` 只做原始归档
- `topics/` / `_inbox/` 是 AI 知识层输出
- AI 不能直接控制真实文件路径

AI 策略：

- 批处理，不做逐条实时
- 触发条件：`20 条`或`10 分钟`
- 允许批次内拆分多个 topic
- 低置信度进入 `_inbox`

## 6. 默认开发顺序

如果做输入链路：

- 优先剪贴板体验、过滤质量、暂停语义、最近状态可见性

如果做 AI：

- `Contract -> Provider Access -> Review -> Persistence`
- 不要把“接模型”和“写知识层”混成一步

## 7. 常用命令

```bash
pnpm install
pnpm check
pnpm build
pnpm tauri dev
pnpm mock:ai-review run --profile preview --count 20
```

如果只做 Rust 校验：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 8. 维护规则

每次阶段变化，至少更新：

- `最后更新`
- `当前基线提交`
- `当前真实状态`
- `/ai` 页真实边界是否变化

如果发生架构变化，还要同步：

- [技术冻结记录](/Users/louistation/MySpace/Life/tino/docs/03-planning/技术冻结记录.md)
- [Tino AI Runtime 与 Agent 工程方案 v0.1](/Users/louistation/MySpace/Life/tino/docs/03-planning/Tino%20AI%20Runtime%20%E4%B8%8E%20Agent%20%E5%B7%A5%E7%A8%8B%E6%96%B9%E6%A1%88%20v0.1.md)
- [MVP开发任务拆解](/Users/louistation/MySpace/Life/tino/docs/03-planning/MVP%E5%BC%80%E5%8F%91%E4%BB%BB%E5%8A%A1%E6%8B%86%E8%A7%A3.md)

## 9. 一句结论

当前仓库的正确理解不是“AI 已接完”，而是：

> 无 AI 原始归档链路已真实跑通；AI provider config 与 live smoke test 已接真实模型；AI review 已有 live batch、审阅页和 review 留痕；`/ai` 主链路的真实模型调用与知识层持久化仍未接入。
