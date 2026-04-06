# Tino Handoff

> 最后更新：2026-04-06
> 当前基线提交：`395ef47` + workspace multi-provider runtime changes
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
低摩擦收集用户输入，先做原始归档，再由 AI 在后台做批量归并、生成议题与知识输出，最终以 `Markdown` 落盘给 Obsidian / 思源等系统使用。

## 3. 当前真实状态

- `M0/M1/M2/M3/M4` 最小真实链路已通
- `M5 AI Pipeline` 已进入 `Phase 2 Minimal LLM Link`
- `M6 Knowledge Output` 已进入 `Manual Persistence Bridge`

当前已真实存在：

- Rust 剪贴板轮询
- `CaptureRecord`
- `daily/*.md` 原始归档
- clipboard panel 最近历史保留窗口（当前缓存已落到 app data；`clipboard-cache/clipboard/*.jsonl` + `clipboard-cache/tino.db` + `clipboard-cache/app-icons/` 不裁剪 `daily` / `topics` / `_inbox` / 持久化附件）
- `_system/runtime.json`
- `_system/queue.json`
- `_system/batches/*.json`
- settings / dashboard 的真实 Rust 持久化与读取
- Runtime Provider 多配置 CRUD 与当前启用项切换；provider profile 已拆分为 `vendor + baseURL + apiKey + default model override`
- settings 页 live provider smoke test
- 首页右侧单个模型 selector，按 provider 分组；首页切换只影响当前会话，不改 settings 中的默认 provider
- Renderer 侧 OpenAI Responses provider access layer（支持自定义 `baseURL`）
- `/ai` 页读取 live batch（当前主要作为隐藏干预 / 校准面）
- `/ai` 页支持单批次 manual live candidate run（renderer 侧 live `generateObject`）
- review 提交写入 `_system/reviews/*.json`
- `applyBatchDecision` 受控写入 `topics/*.md`
- `applyBatchDecision` 受控写入 `_inbox/YYYY-MM-DD.md`
- review 提交后 batch 状态更新为 `persisted`

当前仍未真实存在：

- 静默后台自动落盘
- 独立正式 topic index 资产
- 历史补跑

## 4. 当前 `/ai` 页必须这样理解

- `/ai` 页读取的 batch 可以是 live batch
- preview batch 仍使用 mock 结果
- live batch 现在可以手动触发 renderer 侧 live `generateObject`
- live candidate 在提交前只保留在 renderer 内存中
- `applyBatchDecision` 当前负责审阅应用、review 留痕与受控知识落盘，但仍不生成 batch、不调用模型
- `/ai` 当前更接近隐藏干预 / 校准界面，不是普通用户的主产品路径
- 若当前启用 provider 的 `apiKey` 为空，capture 只进 `daily`，不进 AI queue

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

- clipboard history 是输入插件缓存，不是长期知识真相源
- clipboard retention 只作用于 app data 下的 clipboard panel / history query 缓存层
- 来源应用图标缓存也属于 clipboard 插件 UI 缓存，放 app data，不写入长期 Markdown 资产
- `daily/` 只做原始归档
- `daily/` / `topics/` / `_inbox/` / 已持久化附件应视为长期知识资产，不应被 clipboard retention 误删
- `topics/` / `_inbox/` 是 AI 知识层输出
- `topic` 是系统后台生成的结果，不是用户前置输入
- AI 不能直接控制真实文件路径

AI 策略：

- 批处理，不做逐条实时
- 触发条件：`20 条`或`10 分钟`
- 用户主路径是 `inbox-first`，不是 `topic-first`
- 用户不需要先创建 topic
- 允许批次内归并或拆分为多个系统生成的 topic
- 低置信度进入 `_inbox`
- 用户主路径是 `静默输入 -> 后台编译 -> 结果呈现`
- review / 调试只作为异常兜底与开发校准层

## 6. 默认开发顺序

如果做输入链路：

- 优先剪贴板体验、过滤质量、暂停语义、最近状态可见性

如果做 AI：

- `Contract -> Provider Access -> Runtime -> Hidden Intervention -> Persistence`
- 不要把“接模型”和“写知识层”混成一步
- 不要把 `/ai review` 误当成普通用户主体验

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

> 无 AI 原始归档链路已真实跑通；AI provider config 已升级为多 profile 管理，并按 `vendor + baseURL + apiKey + default model override` 建模，支持 live smoke test、首页按 provider 分组的单个模型 selector，以及 `/ai` 与后台自动链路共用 settings 中的默认 provider；`/ai` 当前主要承担隐藏干预与校准，并已支持单批次 manual live candidate run + manual persistence apply；普通用户主路径仍应理解为静默输入、后台编译与知识结果交付；自动静默落盘仍未接入。
