---
name: tino-task-router
description: "Use this skill to choose the smallest valid context set in Tino. Route tasks to the right planning doc or repo-local skill instead of bulk-reading README, archive docs, or unrelated plans."
---

# Tino Task Router

Choose the smallest valid context set. This skill is a router, not a second source of truth.

## Start Here

- Read `AGENTS.md` first.
- Read `docs/03-planning/HANDOFF.md` only for current behavior, current phase, or current command entry points.
- Read `docs/03-planning/技术冻结记录.md` only for frozen architecture or responsibility boundaries.
- Do not read archive docs, brainstorming notes, or README by default.

## Routing

- Rust/Tauri IPC, commands, DTOs, events, `specta`, generated bindings, or renderer-facing Rust types:
  Read `AGENTS.md`.
  Add `docs/03-planning/技术冻结记录.md` only if the task may change ownership, batching, persistence, or AI/runtime boundaries.
- `/ai` page, hidden intervention semantics, `applyBatchDecision`, live batch, queue/batches/reviews, empty-state debugging, or mock injection:
  Read `.agents/skills/tino-ai-review-phase1/SKILL.md`.
- AI runtime layering, provider-vs-runtime split, workflow design, phase sequencing, or persistence planning:
  Read `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md`.
  `docs/03-planning/技术冻结记录.md` wins on boundary conflicts.
- Packaging, signing, preview/prod data channel, or build/install flow:
  Read `docs/03-planning/环境与打包流程.md`.
- Product scope, MVP boundary, or user-facing AI capability boundary:
  Read `docs/02-product/个人信息流软件需求原型文档.md`.
  Read `docs/02-product/Tino AI 能力地图 v0.2.md` only if the task is specifically about AI capability scope.

## Update These Docs When Needed

- If the task changes current behavior or stage claims, update `docs/03-planning/HANDOFF.md`.
- If the task changes frozen architecture or responsibility boundaries, update `docs/03-planning/技术冻结记录.md`.
- If the task changes AI phase sequencing or runtime layering, update `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md`.
