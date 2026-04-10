---
name: tino-rust-boundaries
description: "Use this skill for Tino Rust/Tauri command and module-boundary work: keep `commands/*.rs` as IPC adapters, keep platform and persistence logic out of adapter files, and decide what belongs in Rust vs Renderer without over-designing."
---

# Tino Rust Boundaries

This skill is repo-specific boundary guidance. It does not replace generic Rust style guidance or the Rust IPC rules in `AGENTS.md`.

## Use This For

- adding or changing Tauri commands
- deciding whether logic belongs in `commands`, feature modules, platform helpers, storage helpers, or Renderer
- refactors where a Rust file is starting to become a mixed-responsibility god file

## Load Order

1. Read `AGENTS.md` first.
2. Read `docs/03-planning/HANDOFF.md` only if you need current implementation boundaries.
3. Read `docs/03-planning/技术冻结记录.md` only if the task may change ownership or responsibility boundaries.

## Core Rule

- `commands/*.rs` are IPC adapters, not feature homes.

## Keep In Command Files

- Tauri command signatures
- `#[specta::specta]` command exposure
- small input normalization and lightweight validation
- forwarding to domain, service, storage, or platform modules
- lightweight result mapping

## Move Out Of Command Files

- OS or platform integration details
- file and directory IO
- persistence policy and path construction
- Markdown or document rendering
- queue or batch orchestration
- reusable business rules, heuristics, or transforms

## Extraction Heuristics

Extract a lower-level module when any of these become true:

- a command needs more than `1-2` nontrivial helpers
- a file mixes validation, persistence, and rendering
- the same platform rule or domain rule appears in a second place
- a file is growing because of implementation detail, not because it exposes more IPC

Prefer principle over exact folder names. `feature`, `service`, `platform`, `storage`, or narrower module names are all acceptable if dependency direction stays clean.

## Ownership Defaults

- Rust owns: IPC contracts, filesystem access, OS integration, runtime-enforced persisted DTOs, and side effects that must stay trusted
- Renderer owns: UI state, prompt assembly, model calling, renderer-only view models, and temporary interaction state

If a type crosses the Rust <-> Renderer boundary, follow the Rust IPC flow in `AGENTS.md`. Do not recreate Rust-owned IPC shapes manually in TypeScript.

## Anti-Patterns

- using `commands/*.rs` as a place to "just finish the feature first"
- moving mixed logic into `app_state` as a temporary holding area
- splitting files only by line count while keeping the same wrong dependency direction
- adding a second local copy of a Rust-owned IPC type in Renderer code

## Current Healthy Pattern

- keep orchestration near the feature entrypoint
- isolate platform-heavy internals into focused modules
- keep pure helpers pure
- update docs only when boundaries or current-state claims actually change

## Before Finishing

- if Rust IPC shapes changed, follow `AGENTS.md` and run `pnpm gen:bindings`
- run `cargo check --manifest-path src-tauri/Cargo.toml`
- run `cargo test --manifest-path src-tauri/Cargo.toml` when behavior changed
- update `docs/03-planning/HANDOFF.md` if current behavior or boundaries changed
- update `docs/03-planning/技术冻结记录.md` only if frozen ownership changed
- run the graphify rebuild when available; if `graphify` is missing in the local Python environment, record the blocker explicitly instead of claiming success
