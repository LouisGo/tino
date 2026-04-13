# Tino Handoff

> 最后更新：2026-04-13
> 当前基线提交：`5630611` + working tree AI rethink planning updates
> 角色：短版 current-state 控制文档
> 原则：只写当前有效信息；旧 AI 过渡方案不再在这里保留双轨表述

## 1. 先读什么

必读：

1. [AGENTS.md](/Users/lou/Learn/tino/AGENTS.md)
2. [技术冻结记录](/Users/lou/Learn/tino/docs/03-planning/技术冻结记录.md)
3. 本文

按任务再读：

- AI 模块开发、runtime、能力边界、反馈记忆：  
  [Tino AI Rethink 与模块开发基线 v1](/Users/lou/Learn/tino/docs/03-planning/Tino%20AI%20Rethink%20%E4%B8%8E%E6%A8%A1%E5%9D%97%E5%BC%80%E5%8F%91%E5%9F%BA%E7%BA%BF%20v1.md)
- 里程碑与任务拆解：  
  [MVP开发任务拆解](/Users/lou/Learn/tino/docs/03-planning/MVP%E5%BC%80%E5%8F%91%E4%BB%BB%E5%8A%A1%E6%8B%86%E8%A7%A3.md)
- 打包、环境、签名：  
  [环境与打包流程](/Users/lou/Learn/tino/docs/03-planning/%E7%8E%AF%E5%A2%83%E4%B8%8E%E6%89%93%E5%8C%85%E6%B5%81%E7%A8%8B.md)
- 产品目标与 AI 能力边界：  
  [个人信息流软件需求原型文档](/Users/lou/Learn/tino/docs/02-product/%E4%B8%AA%E4%BA%BA%E4%BF%A1%E6%81%AF%E6%B5%81%E8%BD%AF%E4%BB%B6%E9%9C%80%E6%B1%82%E5%8E%9F%E5%9E%8B%E6%96%87%E6%A1%A3.md)  
  [Tino AI 能力地图 v0.2](/Users/lou/Learn/tino/docs/02-product/Tino%20AI%20%E8%83%BD%E5%8A%9B%E5%9C%B0%E5%9B%BE%20v0.2.md)
- legacy `/ai` / review 资产说明（deprecated）：  
  [AI Review 当前实现与 Mock 链路说明](/Users/lou/Learn/tino/docs/03-planning/AI%20Review%20%E5%BD%93%E5%89%8D%E5%AE%9E%E7%8E%B0%E4%B8%8E%20Mock%20%E9%93%BE%E8%B7%AF%E8%AF%B4%E6%98%8E.md)

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

- Rust-owned background compiler
- 正式 topic index 资产
- feedback memory / quality metrics SQLite
- 新的 AI Ops 次级入口
- 历史补跑

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

## 6. 默认开发顺序

如果做输入链路：

- 优先剪贴板体验、过滤质量、暂停语义、最近状态可见性

如果做 AI：

- `Contract -> Storage / Feedback -> Capability Boundary -> Rust Background Compiler -> Persistence -> AI Ops`
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
- [技术冻结记录](/Users/lou/Learn/tino/docs/03-planning/技术冻结记录.md)
- [Tino AI Rethink 与模块开发基线 v1](/Users/lou/Learn/tino/docs/03-planning/Tino%20AI%20Rethink%20%E4%B8%8E%E6%A8%A1%E5%9D%97%E5%BC%80%E5%8F%91%E5%9F%BA%E7%BA%BF%20v1.md)

如果只是排查 legacy `/ai` 行为，再额外参考：

- [AI Review 当前实现与 Mock 链路说明](/Users/lou/Learn/tino/docs/03-planning/AI%20Review%20%E5%BD%93%E5%89%8D%E5%AE%9E%E7%8E%B0%E4%B8%8E%20Mock%20%E9%93%BE%E8%B7%AF%E8%AF%B4%E6%98%8E.md)

## 9. 一句结论

当前仓库的正确理解不是“AI 已经接完”，而是：

> 输入侧和原始归档链路已经真实可用；provider settings 与 legacy `/ai` 只完成了过渡期能力接入；后续 AI 开发应围绕 `Rust-owned background compiler + feedback memory + controlled persistence + AI Ops` 推进，而不是继续扩旧 `/ai review` 方案。
