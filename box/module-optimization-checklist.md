# Module Optimization Checklist

> 基于 `box/module-optimization-plan.md` 的二次复核  
> 更新：2026-04-10

## 复核结论

- [x] `app_state.rs` 体量与职责过载问题真实存在（当前约 4489 行）。
- [x] `backend/clipboard_history/* -> app_state` 反向依赖真实存在，且是首要边界问题。
- [x] `commands/*` 作为 IPC 入口层整体仍偏薄，问题主要在其下游模块边界。
- [x] Renderer 侧绑定消费路径保持稳定（`src/lib/tauri.ts` + `src/types/shell.ts`）的约束合理。
- [x] 计划中的 `graphify-out/ missing` 描述已过期，当前图谱目录存在。

## 执行 Checklist

### W0 基线与护栏

- [x] 记录 `app_state` 当前外部依赖入口（backend/runtime/storage 等）。
- [x] 记录 `crate::app_state` 的反向导入位置。
- [x] 执行 `cargo check --manifest-path src-tauri/Cargo.toml` 基线编译。

### W1 抽离 Clipboard 共享类型

- [x] 新增 `src-tauri/src/clipboard/types.rs`。
- [x] 将 clipboard DTO 从 `app_state.rs` 迁移到 `clipboard/types.rs`。
- [x] 更新 `capture.rs` / `commands/*` / `backend/clipboard_history/*` / `lib.rs` 的类型导入。
- [x] 保持行为不变并通过编译。

### W2 下沉 knowledge-root 路径与布局助手

- [x] 新增 `src-tauri/src/storage/knowledge_root.rs`。
- [x] 迁移 `ensure_knowledge_root_layout` 与纯路径 helper。
- [x] 更新 `commands/ai.rs` 与 `app_state.rs` 的导入来源。
- [x] 保持路径/文件格式语义不变并通过编译。

### W3 抽离 legacy history 与 pins

- [x] 新增 `backend/clipboard_history/legacy.rs`。
- [x] 新增 `backend/clipboard_history/pins.rs`。
- [x] 迁移 JSONL fallback 与 pin 持久化逻辑，消除 `backend/clipboard_history/* -> app_state` 依赖。
- [x] 保持 sqlite fallback 协调逻辑与行为语义不变。

### W4 抽离 clipboard preview / ingest 域逻辑

- [x] 新增 `clipboard/preview.rs` 与 `clipboard/ingest.rs`。
- [x] 迁移 preview/hydration/filter/daily/asset 逻辑。
- [x] `process_capture` 收敛为 orchestration。

### W5 分解 app_state 内部职责

- [x] `app_state.rs` 转为 `app_state/mod.rs` 门面。
- [x] 提取 `app_state/settings.rs` / `runtime.rs` / `shortcuts.rs` / `ocr.rs`。
- [x] 保留跨模块编排入口与共享状态容器（`mod.rs` 收敛为门面 + 状态容器，细节下沉子模块）。
- [x] 按 review 收口边界：`app_state/runtime.rs` 移除 JSONL retention/file-IO internals，仅保留编排调用。
- [x] 按 review 收口边界：sqlite store-read helper 从 `legacy.rs` 下沉到 `backend/clipboard_history/read.rs`。
- [x] 按 review 收口边界：`legacy.rs` 移除重复 preview/hydration/OCR helper，统一复用 `clipboard/preview.rs`。
- [x] 按 review 收口边界：sqlite upsert 入口迁至 `backend/clipboard_history/write.rs`，`legacy.rs` 保持 JSONL 侧职责。

### W6 命令与绑定稳定性

- [x] 审核 `commands/ai.rs` / `commands/shell.rs` 导入与签名。
- [x] 执行 `pnpm gen:bindings`（通过 `pnpm typecheck` 链路触发）。
- [x] 执行 `pnpm typecheck`。

### W7 清理与收口

- [x] 移除死代码与过时 re-export（移除 `CaptureHistoryEntry` 未消费查询字段，保留必要导出）。
- [x] 补充或迁移模块级测试（新增 `backend/clipboard_history/read.rs` 的 sqlite->legacy fallback 测试）。
- [x] 如边界变化，更新 `docs/03-planning/HANDOFF.md` 与 `docs/03-planning/技术冻结记录.md`。
- [x] 运行 graphify 重建命令保持图谱同步。
