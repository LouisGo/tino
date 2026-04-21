# AI Review 当前实现与 Mock 链路说明

> 状态：`deprecated`
> 停用日期：2026-04-13
> 角色：仅保留为 legacy `/ai` 与 manual persistence bridge 的历史说明

不要再用这份文档指导新的 AI 模块开发。

请改读：

- [Tino AI Rethink 与模块开发基线 v1](/Users/lou/Learn/tino/docs/03-planning/Tino%20AI%20Rethink%20%E4%B8%8E%E6%A8%A1%E5%9D%97%E5%BC%80%E5%8F%91%E5%9F%BA%E7%BA%BF%20v1.md)
- [Tino Handoff](/Users/lou/Learn/tino/docs/03-planning/HANDOFF.md)

当前保留下来的历史事实只有三点：

- 仓库里仍有 legacy `/ai` 页面与 review DTO
- `applyBatchDecision` 仍是现有代码中的手动受控持久化命令
- `pnpm mock:ai-review` 仍可用于生成 queue / batch / runtime 的近真实测试数据

但这些都不再代表后续 AI 模块开发方向。

新的方向是：

- `/ai` 页面可以被替换或删除
- 后台 AI 主链路改为 `Rust-owned background compiler`
- review-first 语义不再作为 AI 模块中心

如果你只是需要排查 legacy `/ai` 行为，可继续使用：

- `pnpm mock:ai-review run --profile preview --count 20`

除此之外，新的 AI 设计与实现一律以新基线文档为准。
