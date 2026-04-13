# Tino AI Runtime 与 Agent 工程方案 v0.1

> 状态：`deprecated`
> 停用日期：2026-04-13
> 原因：本文件基于旧的 `renderer-owned background runtime + /ai review bridge` 假设，已不再代表 Tino 的目标 AI 架构

请改读：

- [Tino AI Rethink 与模块开发基线 v1](/Users/lou/Learn/tino/docs/03-planning/Tino%20AI%20Rethink%20%E4%B8%8E%E6%A8%A1%E5%9D%97%E5%BC%80%E5%8F%91%E5%9F%BA%E7%BA%BF%20v1.md)
- [Tino Handoff](/Users/lou/Learn/tino/docs/03-planning/HANDOFF.md)
- [技术冻结记录](/Users/lou/Learn/tino/docs/03-planning/技术冻结记录.md)

本文件中以下旧假设都不再作为后续开发基线：

- 后台 AI runtime 由 `Renderer` 持有
- `/ai` review 作为阶段性主干预面
- 以 review-first 状态机来理解后台 AI 主链路
- 把 provider access 的打通视为 AI 模块的主要里程碑

如果你正在看当前代码里的 legacy `/ai`、manual live run、`applyBatchDecision` 或 review DTO：

- 它们仍然是现存过渡资产
- 但不再是新 AI 模块开发的方向
- 后续工作应围绕新的 `Rust-owned background compiler + feedback memory + AI Ops` 基线推进
