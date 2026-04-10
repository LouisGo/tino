# Rust Architecture Handoff 2026-04-10

## 本轮目标

继续按 Rust 最佳实践做高 ROI、低回归风险的架构收口，核心方向是把 `command` 层压回 Tauri IPC 适配层，不再承载平台细节和领域实现。

## 已完成

- 抽离剪贴板来源应用能力到 `src-tauri/src/clipboard/source_apps.rs`
  - 应用列表发现
  - 应用图标缓存与加载
  - macOS Spotlight / running apps 聚合
- 抽离剪贴板回放与 paste-back 到 `src-tauri/src/clipboard/replay.rs`
  - pasteboard 写入
  - 回填上一个 app
  - Accessibility 权限检查
  - codesign 校验
  - 目标焦点恢复与 `Cmd+V` 注入
- IPC 相关类型已归位到 `src-tauri/src/clipboard/types.rs`
  - `ClipboardReplayRequest`
  - `ClipboardReturnResult`
- `src-tauri/src/commands/shell.rs` 已明显瘦身
  - 现在主要保留命令签名和转发
  - `clipboard` 相关命令已不再直接承载 macOS 平台实现
- 共享路径帮助函数 `batch_file_path(...)` 已收回 `storage/knowledge_root.rs`，避免运行时层重复持有存储路径逻辑

## 当前状态

- `command -> feature module` 的边界已经清晰很多
- `shell.rs` 当前约 `287` 行，已经基本回到 adapter 角色
- 现阶段最大的剩余厚模块不是 `shell.rs`，而是 `clipboard/replay.rs`
- 本轮未改 IPC 命令名，目标行为保持不变

## 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`

结果：全部通过，测试 `36/36` 通过，graphify 已重建。

## 下一步建议

1. 继续拆 `src-tauri/src/clipboard/replay.rs`
   - 优先拆成 `pasteboard write`、`codesign/authorization`、`accessibility/focus` 三块
   - 对外保留当前稳定入口，避免影响已接好的 IPC
2. 评估 `shell.rs` 中残余系统动作
   - `open_in_preview`
   - `reveal_in_file_manager`
   - 这类可逐步收口到更通用的系统/平台模块
3. 后续再看更高层收益点
   - 若 `clipboard` 边界稳定，再考虑继续拆其它仍偏厚的 command/feature 组合

## 接力原则

- 不改已暴露的 Tauri command 名称和参数形状
- 优先抽离实现，不先改行为
- 每一刀都跑 `cargo check`、`cargo test`，并重建 graphify
