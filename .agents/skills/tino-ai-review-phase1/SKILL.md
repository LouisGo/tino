---
name: tino-ai-review-phase1
description: "Use this skill for Tino /ai work in the current M5 Phase 1 state: review page semantics, live batch debugging, applyBatchDecision behavior, queue-to-batch promotion, or running the near-real mock chain without calling a real model."
---

# Tino AI Review Phase 1

## Load Order

1. Read `docs/03-planning/AI Review 当前实现与 Mock 链路说明.md`.
2. Read `docs/03-planning/HANDOFF.md` only if you need broader current-state alignment.
3. Read `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md` only if the task is about next-phase architecture, not current semantics.

## Current Truths

- `/ai` can display a real live batch from the filesystem.
- The current sorting result is renderer-side `trial sorting pass`, not real model output.
- `applyBatchDecision` applies review, validates references, writes `_system/reviews/*.json`, and marks the batch `reviewed`.
- `applyBatchDecision` does not generate batches, call a model, write `topics/`, write `_inbox/`, or refresh a formal topic index.
- Batch generation happens earlier: `capture -> queue -> promote -> _system/batches/*.json`.
- If `apiKey` is empty, capture stays in `daily` and does not enter the AI queue.

## Debug Order For Empty `/ai`

1. Confirm the knowledge root or profile matches what the app is actually using.
2. Check whether new captures reached `_system/queue.json`.
3. Check whether the queue met `20 items` or `10 minutes`, or was manually promoted.
4. Check whether `_system/batches/*.json` exists and is `ready`.
5. Only after that inspect renderer empty-state logic.

## Mock Chain

Use the filesystem mock chain, not browser demo fixtures, when you need a near-real `/ai` verification path.

Common command:

```bash
pnpm mock:ai-review run --profile preview --count 20
```

Useful variants:

```bash
pnpm mock:ai-review inject --profile preview --count 20
pnpm mock:ai-review promote --profile preview
pnpm mock:ai-review status --profile preview
```

Relevant files:

- `scripts/mock-ai-review-chain.mjs`
- `src/features/ai/lib/mock-fixtures.ts`
- `src/features/ai/lib/mock-review.ts`

Browser fixture files are preview-only and do not write a knowledge root.

## Guardrails

- Do not describe the current system as "real model connected" or "AI finished".
- Do not repurpose `applyBatchDecision` into task generation without updating docs and phase framing.
- If `/ai` semantics change, update both `docs/03-planning/AI Review 当前实现与 Mock 链路说明.md` and `docs/03-planning/HANDOFF.md`.
