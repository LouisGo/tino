# Tino

Desktop app for personal information flow capture, background compile, and markdown-first knowledge output.

## Start Here

Required:

1. `AGENTS.md`
2. `docs/03-planning/HANDOFF.md`
3. `docs/03-planning/技术冻结记录.md`
4. `docs/03-planning/Tino AI 2.0 开发总计划.md`

Read more only by task:

- Product / AI definition: `docs/02-product/Tino AI 2.0 文档索引.md`
- AI runtime baseline: `docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`
- Silent compile next-stage plan: `docs/03-planning/Tino AI 静默编译与显式意图执行方案 v0.1.md`
- Silent compile migration plan: `docs/03-planning/Tino AI 静默编译优化与迁移方案 v0.1.md`
- AI quality loop: `docs/03-planning/Tino AI 开发期质量管线计划 v0.1.md`
- Packaging / signing: `docs/03-planning/环境与打包流程.md`
- Full docs entry: `docs/README.md`

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
