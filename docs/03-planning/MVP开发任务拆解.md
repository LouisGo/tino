# 个人信息流软件 MVP 开发任务拆解

> 基线文档：`docs/02-product/个人信息流软件需求原型文档.md`
> MVP 心智：`inbox-first`。用户先丢内容，系统后台再长出议题。
> 当前 AI 执行基线：`docs/03-planning/Tino AI Rethink 与模块开发基线 v1.md`

## 1. 当前开发顺序判断

基于现有原型文档，最合理的执行顺序不是直接开始写功能，而是：

1. 任务拆解
2. 小范围技术冻结
3. 项目骨架搭建
4. 按主链路逐模块实现

原因：

- 大方向技术选型已经足够明确，不需要继续发散
- 现在直接搭骨架，容易把模块边界写乱
- 先拆成模块与里程碑，后续写代码时不会把 `Capture`、`Orchestrator`、`AI Pipeline` 混成一团

## 2. MVP 主链路

第一版只围绕下面这条链路展开：

```text
剪贴板轮询
  -> Capture 标准化
  -> 最小过滤 / 去重
  -> 归档 daily/*.md
  -> 进入缓冲区
  -> 批量触发 AI
  -> 聚类 / 归并 / 议题建议
  -> 写入 topics/*.md 或 _inbox/*.md
```

所有不直接服务这条链路的内容，都不应该抢进第一阶段。

## 3. 模块拆解

### M0. 技术冻结

目标：不是重新选型，而是把实现边界钉死。

需要冻结的决定：

- Tauri 是否使用官方 `tray` / menubar 方案
- 剪贴板轮询放在 Rust 侧还是前端侧
- 文件写入统一走哪一层
- 交互式 AI 与后台 AI 的运行归属如何切分
- `_system/` 状态文件与 feedback store 分别采用什么存储

建议结论：

- Tray 和系统集成走 Tauri 原生能力
- 剪贴板轮询放 Rust 侧
- 文件写入放 Rust 侧
- 交互式 AI 在 `Renderer`
- 后台 AI 编译 runtime 在 `Rust async runtime`
- `_system/` 继续用 JSON；feedback / quality 进入本地 SQLite

完成标准：

- 形成一份不超过一页的“技术冻结记录”

### M1. App Shell

目标：把项目跑起来，但只做最小壳层。

任务：

- 初始化 Tauri + React + TypeScript 项目
- 建立基础目录结构
- 接入 menubar / tray
- 提供最小窗口或调试面板
- 打通开发环境和构建命令

完成标准：

- App 能启动
- Tray 可见
- 可打开一个最小面板

### M2. Capture

目标：把剪贴板内容稳定收进系统。

任务：

- 轮询 `NSPasteboard.changeCount`
- 检测文本内容变化
- 生成统一 `CaptureRecord`
- 附带时间戳、来源、内容 hash

建议输出字段：

- `id`
- `source`
- `captured_at`
- `content_type`
- `raw_text`
- `hash`

完成标准：

- 用户复制文本后，系统能生成结构稳定的捕获记录

### M3. Processing Orchestrator

目标：把原始输入变成可批处理的稳定任务流。

任务：

- 内容去重
- 最小安全过滤
- 缓冲区写入
- 批次聚合
- 批处理触发
- 失败重试状态记录

MVP 最小过滤建议：

- 空文本忽略
- 超短文本忽略
- 疑似密码 / token / 验证码文本忽略

完成标准：

- 新内容能进入缓冲区
- 重复内容不会无限进入队列
- 可形成明确批次

### M4. Archive Pipeline

目标：确保所有原始内容先被保留下来。

任务：

- 设计 `daily/` 命名规则
- 追加写入 daily Markdown
- 保留来源、时间、原始文本
- 确保归档写入与 AI 成功与否解耦

完成标准：

- 即使 AI 失败，原始内容仍然已进入 `daily/`

### M5. AI Contract Reset

目标：先把 AI 的输入输出、状态机、质量口径钉死，而不是先写新 UI。

任务：

- 定义 `BatchCompileJob` / `BatchCompileInput` / `BatchCompileDecision`
- 定义 Rust 权威 batch runtime state
- 定义 `PersistedKnowledgeWrite`
- 定义 `FeedbackEvent` / `QualitySnapshot`
- 固定第一版 compile schema 与失败语义

完成标准：

- 背景编译可以脱离 `/ai` 页面被描述为完整工作流
- 新开发不再依赖 review-first DTO 思维

### M6. Storage Reset

目标：先把 AI 运行态和反馈记忆的存储拆开。

任务：

- 明确 `_system/queue` / `batch` / `runtime` / `job audit` 文件结构
- 建立 feedback / quality / preference 的本地 SQLite store
- 明确 topic index 的正式资产形态

完成标准：

- 后台 AI runtime 与反馈记忆有清晰持久化边界
- 不再把 AI 状态主要放在页面内存里理解

### M7. Background Compiler

目标：把后台 AI 主链路迁到 Rust runtime。

任务：

- Rust runtime 驱动 batch compile 调度
- 接通 capability boundary
- 执行结构化 compile
- 校验 schema
- 记录失败、重试、恢复

完成标准：

- 不打开 `/ai` 页也能跑后台 AI 编译
- 批次状态机、重试和崩溃恢复不依赖 React 生命周期

### M8. Knowledge Output

目标：把 compile 结果稳定落为 Markdown 知识文件。

任务：

- 设计系统生成 `topics/` 的文件命名规则
- 设计 `_inbox/` 兜底规则
- 决定追加写入还是新建文件
- 确保路径生成由程序控制，不由 AI 直接控制
- 刷新正式 topic index 资产

完成标准：

- 高置信度内容进入 `topics/`
- 低置信度内容进入 `_inbox/`
- 写入、索引刷新、审计记录形成闭环

### M9. Feedback Memory 与 Quality Loop

目标：让落库质量开始可量化、可提升。

任务：

- 记录用户纠错、删除、保留、topic 使用行为
- 计算并暴露主动纠错率
- 将偏好信号注入后续 compile context

完成标准：

- `用户主动纠错率` 成为可观察指标
- AI 质量改进不再只靠主观感觉

### M10. AI Ops

目标：用新的运行态重做次级 AI 调试入口。

任务：

- 替换或清理旧 `/ai` 页面
- 提供 job 状态、失败、重试、回放、写入结果视图
- 保留最小调试能力，但不做 review-first 主体验

完成标准：

- 能快速判断卡在 capture / queue / compile / persist / feedback 哪一环
- 新入口服务开发与异常排查，而不是人工逐批审阅

## 4. 里程碑建议

### 里程碑 1：主壳可运行

包含模块：

- `M0 技术冻结`
- `M1 App Shell`

结果：

- 项目可启动、可开发、可构建

### 里程碑 2：无 AI 的采集闭环

包含模块：

- `M2 Capture`
- `M3 Processing Orchestrator`
- `M4 Archive Pipeline`

结果：

- 即使不调用 AI，系统也能把剪贴板内容稳定归档到 `daily/`

### 里程碑 3：AI Contract 与存储基线就绪

包含模块：

- `M5 AI Contract Reset`
- `M6 Storage Reset`

结果：

- AI 开发从 `/ai review` 过渡思路切换到真正的后台编译架构

### 里程碑 4：后台 AI 编译闭环

包含模块：

- `M7 Background Compiler`
- `M8 Knowledge Output`

结果：

- 从复制文本到 `topics/` / `_inbox/` 的后台自动编译闭环打通

### 里程碑 5：可持续迭代基线

包含模块：

- `M9 Feedback Memory 与 Quality Loop`
- `M10 AI Ops`

结果：

- AI 质量进入可测量、可调试、可持续迭代阶段

包含模块：

- `M7 Config / Skill Stub`
- `M8 Debug / Observability`

结果：

- 项目具备后续加规则、加输入源、加调试能力的基础

## 5. 推荐优先级

按开发顺序排序：

1. `M0 技术冻结`
2. `M1 App Shell`
3. `M2 Capture`
4. `M4 Archive Pipeline`
5. `M3 Processing Orchestrator`
6. `M5 AI Pipeline`
7. `M6 Knowledge Output`
8. `M8 Debug / Observability`
9. `M7 Config / Skill Stub`

说明：

- `Archive` 可以比完整 `Orchestrator` 更早落地，因为它是“先保底不丢”的关键
- `Debug` 不应该完全放最后，否则中途排错成本太高
- `Config / Skill` 要先留口，但不需要抢先做复杂实现

## 6. 现在最应该立刻做的事

不是直接写业务逻辑，而是完成下面两项：

1. 写一份 `技术冻结记录`
2. 按 `M1 App Shell` 初始化项目骨架

这两项完成后，后续开发就可以沿主链路稳定推进，不会再次回到“到底该怎么做”的状态。

## 7. 建议的下一份文档

任务拆解之后，最值得立即补的一份文档是：

- `docs/03-planning/技术冻结记录.md`

这份文档只需要回答五个问题：

- Tray 怎么做
- 剪贴板轮询在哪一层
- 文件写入在哪一层
- AI 调用在哪一层
- `_system/` 状态怎么存

一旦这五个问题冻结，就可以正式开始搭项目。
