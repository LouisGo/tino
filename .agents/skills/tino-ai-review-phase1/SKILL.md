---
name: tino-ai-review-phase1
description: "Legacy filename. Use this skill for current Tino AI rethink work: background compiler planning, capability boundaries, feedback memory, AI Ops, and legacy `/ai` compatibility questions."
---

# Tino AI Rethink Router

## Load Order

1. Read `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`.
2. Read `docs/03-planning/HANDOFF.md` only if you need current repo state or transition notes.
3. Read `docs/03-planning/技术冻结记录.md` if the task may change ownership, runtime location, storage, or feedback boundaries.
4. Read `docs/03-planning/archive/AI Review 当前实现与 Mock 链路说明.md` only when debugging legacy `/ai` or `applyBatchDecision`.

## Current Contract

- `/ai` is a disposable legacy surface, not the center of AI product design.
- Provider settings can stay, but provider UI is not the center of AI architecture.
- Interactive AI and background compile are different systems with different owners.
- Background compile ownership belongs to `Rust async runtime`.
- Feedback memory and quality metrics are first-class architecture, not later polish.

## What To Optimize For

1. Contract and state machine before UI.
2. Rust-owned background compiler before new review surfaces.
3. Feedback memory and correction metrics before prompt polish.
4. AI Ops observability before new user-facing AI chrome.

## Legacy Compatibility

- `applyBatchDecision`, legacy review DTOs, and `pnpm mock:ai-review` still exist.
- Use them only to understand or unwind transition code.
- Do not extend them as the future AI architecture.

## Guardrails

- Do not make React component state authoritative for batch runtime.
- Do not build new product semantics on top of legacy `/ai review`.
- Do not let provider setup shape the core AI module boundaries.
- Do not delay feedback-memory design until after UI polish.
- If AI architecture changes, update `Tino AI Rethink 与模块开发基线 v1.md`, `HANDOFF.md`, and `技术冻结记录.md`.
