# Rust/Tauri Boundary Guardrails

> Updated: 2026-04-10
> Purpose: keep Tino Rust changes from drifting back into oversized Tauri adapter files

## One-Line Rule

`commands/*.rs` should expose IPC, not become the home of platform details, persistence flows, or domain workflows.

## Put It In `commands/*.rs` Only If

- it is the command signature or `specta` exposure
- it is small input normalization
- it forwards to a lower-level module
- it maps the lower-level result back to the command response

## Move It Out When It Starts Doing Any Of These

- OS or platform integration
- file or directory IO
- Markdown rendering or document assembly
- queue, batch, or workflow orchestration
- reusable domain rules or heuristics

## Stop Signals

Stop and extract a lower-level module when:

- one command grows `1-2` nontrivial helpers
- one file mixes validation, persistence, and rendering
- the same rule appears in a second place
- growth comes from implementation detail rather than new IPC surface

## Ownership Split

- Rust owns: IPC contracts, filesystem access, OS integration, trusted side effects, and runtime-enforced persisted DTOs
- Renderer owns: UI state, prompt assembly, model calls, renderer-only view models, and temporary interaction state

## Flexibility Rule

Do not freeze exact folder names. `feature`, `service`, `platform`, `storage`, or narrower module names are all fine. What matters is clean dependency direction and keeping adapter files thin.

## Validation Habit

- if IPC shapes changed, follow `AGENTS.md` Rust IPC flow
- run `cargo check --manifest-path src-tauri/Cargo.toml`
- run `cargo test --manifest-path src-tauri/Cargo.toml` when behavior changed
- update `docs/03-planning/HANDOFF.md` when current boundaries changed
- if `graphify` is unavailable locally, record the blocker instead of pretending rebuild succeeded
