# Tino

Desktop app for personal information flow capture, review, and markdown-first knowledge output.

## Start Here

Required:

1. `AGENTS.md`
2. `docs/03-planning/HANDOFF.md`
3. `docs/03-planning/技术冻结记录.md`

Read more only by task:

- AI review / mock chain: `docs/03-planning/AI Review 当前实现与 Mock 链路说明.md`
- AI runtime architecture: `docs/03-planning/Tino AI Runtime 与 Agent 工程方案 v0.1.md`
- Task breakdown: `docs/03-planning/MVP开发任务拆解.md`
- Packaging / signing: `docs/03-planning/环境与打包流程.md`

## Commands

```bash
pnpm install
pnpm tauri dev
pnpm build
pnpm check
pnpm mock:ai-review run --profile preview --count 20
```

## Stack

- `Tauri 2`
- `React 19 + Vite`
- `Tailwind CSS v4`
- `shadcn/ui`
- `Zustand`
- `TanStack Router / Query / Table / Form`
