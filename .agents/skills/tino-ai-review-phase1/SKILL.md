---
name: tino-ai-review-phase1
description: "Use this skill for current Tino `/ai` hidden-intervention work: live batch debugging, `applyBatchDecision`, queue-to-batch promotion, manual candidate runs, and the near-real mock review chain."
---

# Tino AI Review State

## Load Order

1. Read `docs/03-planning/AI Review 当前实现与 Mock 链路说明.md`.
2. Read `docs/03-planning/HANDOFF.md` only if you need broader current-state or phase alignment.
3. Read `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md` only for next-phase architecture, not current semantics.

## Current Contract

- `/ai` is currently a hidden intervention, calibration, and debug surface, not the primary end-user product path.
- `applyBatchDecision` is review plus controlled persistence. It writes review artifacts and approved outputs; it does not generate batches or call a model.
- Live candidate generation is renderer-side and stays local until submit.
- Batch generation happens earlier: `capture -> _system/queue.json -> promote -> _system/batches/*.json`.
- If `apiKey` is empty, capture stays in `daily` and does not enter the AI queue.

## Debug Order For Empty `/ai`

1. Confirm the knowledge root or profile matches what the app is actually using.
2. Check whether new captures reached `_system/queue.json`.
3. Check whether the queue met `20 items` or `10 minutes`, or was manually promoted.
4. Check whether `_system/batches/*.json` exists and is `ready`.
5. Only after that inspect renderer empty-state logic.

## Mock Chain

- Use the filesystem mock chain, not browser demo fixtures, for near-real `/ai` verification.
- Main command: `pnpm mock:ai-review run --profile preview --count 20`.
- Script and fixtures: `scripts/mock-ai-review-chain.mjs`, `src/features/ai/lib/mock-fixtures.ts`, `src/features/ai/lib/mock-review.ts`.

Browser fixture files are preview-only and do not write a knowledge root.

## Guardrails

- Do not describe the current system as "AI finished" or as fully automatic.
- Do not frame `/ai` review as the product centerpiece or as the normal daily workflow.
- Do not claim users should manually review every batch.
- Do not repurpose `applyBatchDecision` into task generation without updating docs and phase framing.
- If `/ai` semantics change, update `docs/03-planning/AI Review 当前实现与 Mock 链路说明.md` and `docs/03-planning/HANDOFF.md`.
