# Tino Module Optimization Plan

> Updated: 2026-04-09
> Scope: current repository module boundaries, with `src-tauri` as the first optimization focus
> Note: `graphify-out/` is currently missing, so this plan is based on the live code tree, repo rules, and current imports

## Goal

Reduce structural coupling without changing product behavior.

This round is not a feature redesign. It is a module-boundary cleanup with four concrete goals:

- remove reverse dependencies into `app_state`
- shrink `app_state` back to orchestration
- make clipboard/history/capture concerns self-contained
- keep Tauri IPC and renderer consumption stable

## Current Problems

### 1. `app_state.rs` is carrying too many concerns

It currently mixes:

- state container and orchestration
- settings model and legacy migration
- runtime and queue persistence
- clipboard history legacy JSONL read/write
- pinned clipboard persistence
- capture filtering and daily archive writing
- image/video/icon asset persistence
- preview building and asset hydration
- OCR scheduling
- global shortcut registration

This is the main god-file problem, but not the only one.

### 2. Dependency direction is wrong

`backend/clipboard_history/*` currently imports helpers and types from `app_state`.

That means a lower-level history module depends on a higher-level application state module. This is the first boundary that must be fixed.

### 3. Clipboard domain is split by implementation detail, not by responsibility

The repo already has:

- `capture.rs`
- `backend/clipboard_history/*`
- `storage/capture_history_store.rs`
- large clipboard/capture logic inside `app_state.rs`

The result is that one domain is scattered across watcher, state, backend fallback logic, preview logic, and persistence logic.

### 4. Commands should stay thin, but their backing modules are not yet clean

`commands/ai.rs` and `commands/shell.rs` are acceptable as IPC entrypoints. The problem is not the command layer itself; the problem is that the command layer mostly points into an oversized state module.

### 5. Renderer boundary must not be destabilized by backend cleanup

The renderer already consumes bindings through:

- `src/lib/tauri.ts`
- `src/types/shell.ts`

This should remain true. Rust-side module cleanup must not leak into ad hoc renderer-side type duplication.

## Optimization Principles

### 1. Fix dependency direction before splitting files

If a file is split but the old reverse imports remain, the refactor is cosmetic. First move shared types and leaf helpers to lower layers, then split orchestration.

### 2. Split by domain boundary, not by line count

A new module is justified only when it owns a clear concern:

- settings
- runtime state
- clipboard model
- clipboard ingest
- clipboard history legacy fallback
- pinned captures
- OCR scheduling

### 3. Keep commands thin

Do not create extra wrapper layers around `commands/ai.rs` and `commands/shell.rs` unless a command file itself becomes a mixed-domain god file.

### 4. Preserve IPC ownership rules

If a Rust type is renderer-facing, it stays Rust-owned and continues to flow through Specta bindings. Moving a type across Rust modules is fine. Recreating the type in TypeScript is not.

### 5. No behavior drift in the first round

This round should not change:

- queue trigger semantics
- clipboard retention semantics
- AI runtime ownership
- persistence paths or file formats
- renderer-visible command contracts, except for strictly internal Rust reorganization

## Target Module Boundaries

### `app_state`

Responsibility:

- hold shared application state
- coordinate workflows across modules
- expose high-level methods used by commands, watcher, and app boot

Should depend on:

- `clipboard`
- `backend::clipboard_history`
- `storage`
- existing infrastructure modules such as `app_idle`, `runtime_provider`, `locale`

Should not own:

- legacy history file IO details
- settings migration internals
- preview rendering helpers
- asset-path helpers

### `clipboard`

Responsibility:

- clipboard and capture domain model
- preview building and hydration
- ingest filtering
- daily archive writing
- image/video/icon asset handling

Candidate files:

- `src-tauri/src/clipboard/mod.rs`
- `src-tauri/src/clipboard/types.rs`
- `src-tauri/src/clipboard/preview.rs`
- `src-tauri/src/clipboard/ingest.rs`

### `backend::clipboard_history`

Responsibility:

- read/write access patterns for clipboard history
- fallback coordination between sqlite store and legacy JSONL
- legacy JSONL retention and pin persistence

Candidate files:

- `src-tauri/src/backend/clipboard_history/read.rs`
- `src-tauri/src/backend/clipboard_history/write.rs`
- `src-tauri/src/backend/clipboard_history/migration.rs`
- `src-tauri/src/backend/clipboard_history/legacy.rs`
- `src-tauri/src/backend/clipboard_history/pins.rs`

Constraint:

- must not import `app_state`

### `storage`

Responsibility:

- leaf persistence primitives and storage-specific helpers

Candidate additions:

- `src-tauri/src/storage/knowledge_root.rs`

Constraint:

- stays below `app_state` and below domain orchestration

### `commands`

Responsibility:

- Tauri command entrypoints only

Plan:

- keep current `ai.rs` and `shell.rs`
- only update imports to point at cleaned modules

### Renderer

Responsibility in this round:

- remain stable
- consume the same generated bindings and shell type aliases

Not a primary refactor target in this round.

## Work Units

Each work unit should be independently reviewable and compile cleanly before moving on.

### W0. Baseline and Guardrails

Purpose:

- establish a safe starting point before structural moves

Work:

- record current `app_state` outward dependencies
- record current reverse imports into `app_state`
- run `cargo check --manifest-path src-tauri/Cargo.toml`

Output:

- no code movement yet
- a verified compile baseline

### W1. Extract Shared Clipboard Types

Purpose:

- stop using `app_state` as the home for clipboard DTOs

Work:

- create `src-tauri/src/clipboard/types.rs`
- move these types first:
  - `CaptureRecord`
  - `CapturePreview`
  - `ClipboardPageRequest`
  - `ClipboardPage`
  - `ClipboardPageSummary`
  - `ClipboardBoardBootstrap`
  - `PinnedClipboardCapture`
  - `ClipboardWindowTarget`
  - delete/pin result types
- update imports in:
  - `capture.rs`
  - `commands/shell.rs`
  - `commands/ai.rs`
  - `backend/clipboard_history/*`
  - `lib.rs`

Size:

- one new module
- import churn only, no behavior changes

Done when:

- `app_state` no longer owns clipboard DTO definitions

### W2. Move Knowledge Root and Path Helpers Downward

Purpose:

- provide a common lower-level place for storage/path helpers

Work:

- create `src-tauri/src/storage/knowledge_root.rs`
- move path/layout helpers there:
  - `ensure_knowledge_root_layout`
  - `runtime_file_path`
  - `queue_file_path`
  - `filters_log_file_path`
  - `batches_dir_path`
  - `assets_dir_path`
  - any path helpers with no `AppState` dependency

Size:

- one small module
- narrow API, no domain logic

Done when:

- `commands/ai.rs` and other modules no longer import these helpers from `app_state`

### W3. Pull Legacy Clipboard History Out of `app_state`

Purpose:

- fix the worst dependency inversion in the repo

Work:

- create `backend/clipboard_history/legacy.rs`
- move legacy JSONL logic there:
  - query/load recent entries
  - append/update/delete/promote
  - retention pruning
  - JSONL path iteration and merge helpers
- create `backend/clipboard_history/pins.rs`
- move pinned capture persistence there

Size:

- medium
- highest-value boundary fix in the plan

Done when:

- `backend/clipboard_history/*` no longer imports `crate::app_state`
- `app_state` only calls history APIs, not history internals

### W4. Extract Clipboard Preview and Ingest Domain Logic

Purpose:

- separate domain logic from application state

Work:

- create `clipboard/preview.rs`
- move:
  - preview building
  - preview hydration
  - OCR text normalization helpers
  - file/link display helpers
- create `clipboard/ingest.rs`
- move:
  - capture filtering
  - filter log append
  - daily markdown append/render
  - image/video/icon asset persistence

Size:

- medium
- should be done after W1-W3 so the API surface is already stable

Done when:

- `process_capture` in `app_state` reads like orchestration rather than implementation detail

### W5. Split `app_state` Internals by Concern

Purpose:

- reduce `app_state` to coordination and shared state management

Work:

- convert `src-tauri/src/app_state.rs` into `src-tauri/src/app_state/mod.rs`
- extract:
  - `app_state/settings.rs`
  - `app_state/runtime.rs`
  - `app_state/shortcuts.rs`
  - `app_state/ocr.rs`
- keep only:
  - `AppState`
  - `SharedState`
  - `StateData`
  - orchestration methods that cross modules

Size:

- medium to large
- should happen only after lower layers are already moved

Done when:

- `app_state/mod.rs` becomes the facade rather than the implementation dump

### W6. Command and Binding Stability Pass

Purpose:

- ensure refactor does not leak into renderer breakage

Work:

- review `commands/ai.rs` and `commands/shell.rs` imports
- confirm Rust-owned IPC types still derive `specta::Type` where needed
- run `pnpm gen:bindings` if any renderer-facing Rust type definitions changed
- run `pnpm typecheck` if bindings or command signatures changed

Size:

- small
- stabilization only

Done when:

- renderer still consumes bindings through the existing path
- no hand-written duplicate TS types are introduced

### W7. Final Cleanup and Documentation

Purpose:

- finish the refactor as a maintained system, not as a one-off patch

Work:

- remove dead re-exports and obsolete helpers
- add or move focused unit tests to the new modules
- update planning docs only if ownership boundaries materially changed
- rebuild graph metadata:
  - `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`

Size:

- small
- cleanup and maintenance

## Recommended Execution Order

Execute in this order:

1. `W0`
2. `W1`
3. `W2`
4. `W3`
5. `W4`
6. `W5`
7. `W6`
8. `W7`

This order is deliberate:

- first remove shared-type and path-helper pressure from `app_state`
- then fix reverse dependencies
- then move domain logic
- only after that split `app_state` itself

## Validation Checklist

Run after each work unit as needed:

- `cargo check --manifest-path src-tauri/Cargo.toml`
- targeted Rust tests for the moved module
- `pnpm gen:bindings` when renderer-facing Rust types or command metadata changed
- `pnpm typecheck` when bindings or renderer imports changed

Final acceptance:

- `backend/clipboard_history` no longer imports `app_state`
- `app_state` is an orchestration module, not a persistence sink
- command signatures remain stable
- clipboard, history, runtime, and settings boundaries are easier to reason about from the file tree alone

## Explicit Non-Goals

These are not part of this optimization round:

- redesigning `/ai` review flow
- changing batch trigger behavior
- moving AI execution from renderer to Rust
- reorganizing the renderer feature tree without a separate reason
- introducing abstraction-only modules with no stable responsibility
