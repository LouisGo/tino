# 个人信息流软件 MVP 开发任务拆解

> 基线文档：`docs/02-product/个人信息流软件需求原型文档.md`
> MVP 心智：`inbox-first`。用户先丢内容，系统后台再长出议题。

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
- AI 调用层放在前端还是 Rust command
- `_system/` 状态文件采用什么格式

建议结论：

- Tray 和系统集成走 Tauri 原生能力
- 剪贴板轮询放 Rust 侧
- 文件写入放 Rust 侧
- AI 调用先走前端 `Renderer`
- `_system/` 先用 JSON 文件，不上数据库

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

### M5. AI Pipeline

目标：把一批缓冲内容转换为结构化决策结果。

任务：

- 设计 AI 输入 schema
- 设计 AI 输出 schema
- 固定第一版 prompt
- 调用模型进行批处理
- 校验结构化输出
- 记录失败批次

AI 输出至少包含：

- `source_ids`
- `decision`
- `topic_slug_suggestion`
- `topic_name_suggestion`
- `title`
- `summary`
- `key_points`
- `tags`
- `confidence`
- `reason`

完成标准：

- 一批内容可产出结构化结果
- 结果不合法时能被识别和兜底

### M6. Knowledge Output

目标：把 AI 结果稳定落为 Markdown 知识文件。

任务：

- 设计系统生成 `topics/` 的文件命名规则
- 设计 `_inbox/` 兜底规则
- 生成 front matter
- 决定追加写入还是新建文件
- 确保路径生成由程序控制，不由 AI 直接控制

完成标准：

- 高置信度内容进入 `topics/`
- 低置信度内容进入 `_inbox/`
- Markdown 结构可被 Obsidian / 思源读取

### M7. Config / Skill Stub

目标：先把扩展口留好，不在 MVP 做复杂功能。

任务：

- 创建 `_config/` 目录约定
- 预留 `config.json` 读取逻辑
- 为后续 Skill 注入留接口

完成标准：

- 系统具备最小配置入口，但不要求完善 UI

### M8. Debug / Observability

目标：让 MVP 在开发阶段可验证、可定位问题。

任务：

- 输出基础日志
- 记录批次状态
- 提供最小调试视图或调试命令
- 能看到最近一次 capture / archive / AI / output 的执行结果

完成标准：

- 出问题时能快速判断卡在主链路哪一环

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

### 里程碑 3：AI 闭环打通

包含模块：

- `M5 AI Pipeline`
- `M6 Knowledge Output`

结果：

- 从复制文本到 `topics/` / `_inbox/` 的全链路打通

### 里程碑 4：可持续迭代基线

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
