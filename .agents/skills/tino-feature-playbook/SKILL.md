---
name: tino-feature-playbook
description: "Use this skill when implementing a new Tino feature module or a cross-cutting feature change. It provides the default delivery playbook for choosing IPC shape, ownership, sync model, validation, and required doc updates."
---

# Tino Feature Playbook

Use this for new feature modules, not for tiny local edits.

## First Pass

1. State the user-facing outcome.
2. Classify each new IPC edge as `Query`, `State Command`, `Action Command`, or `Subscription`.
3. Decide the authority:
   Rust for persisted/trusted state and side effects.
   Renderer for transient UI state and view models.

## Default Pattern

- Cold start or remount: snapshot `Query`.
- Ongoing sync: typed `Subscription`.
- Persisted writes: `State Command`, commit in Rust first, then Rust emits authoritative event.
- Immediate side effects: `Action Command`, keep request/response.

## Guardrails

- If multiple windows can edit the same persisted state, add `revision` or equivalent conflict protection.
- Heavy file IO, sqlite, JSON, image work, or batch work must not stay on the Tauri main thread.
- Do not let renderer-broadcast become the source of truth for persisted cross-window state.
- Do not introduce a second hand-written copy of a Rust-owned IPC type in TypeScript.

## Delivery Checklist

- Rust IPC types/commands/events defined first, then `pnpm gen:bindings`, then renderer consumption.
- Snapshot query and subscription are paired where remount or missed-event staleness matters.
- Invalidation scope is narrow; do not default to full-feature invalidation.
- Update `docs/03-planning/HANDOFF.md` if current behavior changed.
- Update `docs/03-planning/技术冻结记录.md` only if ownership or architecture changed.
