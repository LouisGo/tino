---
name: tino-task-router
description: "Use this skill for Tino repo tasks that need fast context routing or current-state alignment. Classify whether the task is Rust IPC, current AI intervention behavior, AI runtime architecture, packaging/signing, or product-boundary work, then read only the minimum matching docs instead of bulk-loading README or archived planning docs."
---

# Tino Task Router

## Goal

Pick the smallest valid context set for the current task. Treat this skill as a router, not as a second source of truth.

## Default

1. `AGENTS.md` is the repo-wide hard rule file.
2. Read `docs/03-planning/HANDOFF.md` only when the task depends on current phase, current AI status, or current command entry points.
3. Do not read archive docs, brainstorming notes, or long product docs unless the route below explicitly requires them.
4. Treat `/ai` and batch review surfaces as hidden intervention and calibration flows, not as the primary end-user product path.

## Routing

- Rust/Tauri IPC, commands, DTOs, events, `specta`, generated bindings, or renderer-facing Rust types:
  Read `AGENTS.md` first.
  Read `docs/03-planning/技术冻结记录.md` only if the change may alter ownership, batching, persistence, or AI/runtime boundaries.
- `/ai` page, hidden intervention semantics, `applyBatchDecision`, live batch, queue/batches/reviews, empty-state debugging, or mock injection:
  Read `.agents/skills/tino-ai-review-phase1/SKILL.md`.
- AI runtime layering, provider-vs-runtime split, workflow design, phase sequencing, or persistence planning:
  Read `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md`.
  If it conflicts with the freeze doc, `docs/03-planning/技术冻结记录.md` wins.
- Packaging, signing, preview/prod data channel, or build/install flow:
  Read `docs/03-planning/环境与打包流程.md`.
- Product scope, MVP boundary, or user-facing AI capability boundary:
  Read `docs/02-product/个人信息流软件需求原型文档.md`.
  Read `docs/02-product/Tino AI 能力地图 v0.2.md` only if the task is specifically about AI capability scope.

## Escalation Rules

- If the task changes current behavior or stage claims, update `docs/03-planning/HANDOFF.md`.
- If the task changes frozen architecture or responsibility boundaries, update `docs/03-planning/技术冻结记录.md`.
- If the task changes AI phase sequencing or runtime layering, update `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md`.
- If old `review-first` wording conflicts with current planning docs, `docs/03-planning/HANDOFF.md` and `docs/03-planning/技术冻结记录.md` win.
- Prefer specialized docs over `README.md`. README is a pointer, not the working context.
