# Tino Handoff

> 最后更新：2026-04-11
> 当前基线提交：`8ac3f7f` + workspace clipboard capture/search changes
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
- clipboard history 边界已收口：`backend/clipboard_history/read.rs` 负责 sqlite 读取边界与 fallback；`backend/clipboard_history/write.rs` 负责 sqlite 写入边界与 fallback；`backend/clipboard_history/legacy.rs` 负责 JSONL + retention 内核；`app_state/runtime.rs` 仅保留编排调用
- settings 页的“暂停采集”已接成真实 Rust 持久化能力；暂停时 watcher 继续轮询，但新复制内容不进 `daily` / history cache / queue / AI，重启后状态保持一致
- renderer 侧 app settings 已按“`persisted settings` 运行态真相源 + `settings draft` 设置页编辑态”分层；成功的设置写入会先落 Rust 持久化，再通过 renderer 内串行写队列 + Tauri IPC 广播到主窗口与 clipboard 小窗，避免双向同步遗漏与并发写覆盖
- clipboard history retention 上限已从 `14 天`提到 `90 天`；现有设置档位为 `1 / 3 / 7 / 90`。设置项现在表示 clipboard history 的查询/展示窗口，切换时不会立即物理删除 90 天内缓存；超过 90 天的缓存仍会在启动、设置保存和定期维护时被真正清理
- clipboard board 搜索框已支持关键词式搜索；除普通文本外，可用 `app:` / `source:`、`bundle:`、`date:`、`type:` 在单个输入框里做组合检索，sqlite 与 JSONL fallback 语义保持一致
- clipboard replay / paste-back Rust 边界已收口：`commands/shell.rs` 对这条链路只保留 IPC adapter；`clipboard/source_apps.rs` 负责来源应用发现与图标缓存；`clipboard/replay/` 目录模块已拆分为 `mod.rs` 编排、`pasteboard.rs`、`authorization.rs`、`focus.rs`
- clipboard board 启动时会由 Rust 预热首屏 `summary + pinned + page 0` bootstrap；只要本地已有历史，应用重启后不应再先落入空白 loading 再回填
- clipboard board 的查询策略现为“事件驱动失效 + 页面挂载重验”双保险，避免窗口或页面未挂载时错过事件后长期停留在旧缓存
- settings 页已支持 clipboard 过滤规则：可按来源应用 `bundle id` 黑名单和关键词排除剪贴板捕获；被排除内容仍会写入 `_system/filters.log` 结构化日志，便于调试
- 主窗口首次可见时会主动预热 macOS `Accessibility` 授权，尽量把剪贴板回填所需的打扰前置到应用打开阶段；授权后仍需重启当前 app 副本
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
- `clipboardHistoryDays` 控制用户可见的历史查询窗口，不直接决定物理删除时机
- clipboard cache 的物理清理窗口固定按 `90 天` 上限执行，避免用户切换设置时误删仍可能恢复的历史
- app_state 不直接持有 clipboard history 的 JSONL retention/file-IO 内核，统一由 `backend/clipboard_history/legacy.rs` 提供能力
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

打 production 包时额外注意：

- `pnpm tauri:build:prod` 只生成正式产物，不会安装到 `/Applications`；当前会在 Finder 自动揭示 `src-tauri/target/release/bundle/macos/Tino.app`
- `pnpm tauri:build-install:prod` 才会把正式包安装到 `/Applications/Tino.app`
- 不要把“从 `.dmg` 挂载卷里直接运行”当成已安装

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
