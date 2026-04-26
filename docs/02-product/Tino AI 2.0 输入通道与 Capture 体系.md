# Tino AI 2.0 输入通道与 Capture 体系

> 日期：2026-04-26
> 角色：冻结输入通道、capture 分层，以及剪贴板在系统中的正确位置
> 状态：最新共识

## 1. 这份文档解决什么问题

`Tino` 不做编辑器，因此它和外部世界之间的输入桥非常关键。

尤其是剪贴板，如果不放回正确层次，它很容易被误解为：

- 知识真相源
- AI 主语义层
- 只是旧时代的一个独立模块

这三种理解都不对。

## 2. 输入通道的总原则

`Tino` 的输入通道应该遵守以下原则：

1. `Tino` 不接管用户主要写作环境
2. 用户可以从任意外部工具把材料带进来
3. 所有输入最终都要归一到统一 capture 与 normalization 体系
4. 输入历史、统一语料、正式知识资产必须分层

## 3. 系统分层

### 3.1 Layer 0: External Work Surfaces

用户真正工作的地方：

- Notion
- Obsidian
- 思源
- VSCode
- 浏览器
- PDF 阅读器
- PPT / Excel / 图片 / 视频等外部工具

`Tino` 不接管这层。

### 3.2 Layer 1: Input Adapter Layer

负责把东西带进来。

包括：

- 剪贴板监听
- 文件导入
- 链接导入
- 拖拽导入
- 选中内容发起 AI
- 全局小窗快速输入

### 3.3 Layer 2: Capture Pipeline Layer

负责把输入变成“合格的可处理输入”。

包括：

- 标准化
- 去重
- 最小过滤
- 敏感信息拦截
- 暂停 / 恢复
- retention
- capture history

### 3.4 Layer 3: Source / Corpus Normalization Layer

负责把输入转换为 AI 工作语料。

包括：

- 保留原始 source
- 通过 adapter 生成 Markdown 语料
- 维护来源、定位、转换关系

## 4. 剪贴板的正确定位

剪贴板是：

- 第一等 `input adapter`
- 高频 `capture channel`
- `Tino` 与外部世界之间的通用输入总线

剪贴板不是：

- 长期知识真相源
- project corpus 本身
- 正式 Markdown 资产

## 5. 剪贴板提供的三种价值

### 5.1 被动采集入口

适合默认 inbox / 收藏型用户。

路径：

`Clipboard -> Capture History -> Inbox Project -> Corpus Document -> Digest / Resurfacing`

### 5.2 显式送入某个项目

适合作家和研究者。

路径：

`Clipboard / Selected Text -> Target Project -> Corpus`

### 5.3 临时上下文桥

用户只是想“拿这段内容问一下 AI”。

路径：

`Clipboard / Selected Text -> Session Context`

这时它不一定自动进入长期 corpus。

## 6. 三层边界必须分清

### 6.1 Clipboard History

是高频输入缓存。

价值：

- 接住
- 回溯
- 暂存

### 6.2 Corpus

是 AI 工作对象。

价值：

- 可检索
- 可理解
- 可引用

### 6.3 Artifact

是正式知识产出。

价值：

- 可复用
- 可继续编辑
- 可长期保存

结论：

> `clipboard history != corpus != artifact`

## 7. `Inbox Project` 不是垃圾场

`Inbox Project` 是输入路由的默认缓冲层，不是所有杂项的永久墓地。

当前固定规则是：

1. 没有显式 project 归属的输入，默认先进 `Inbox Project`
2. 系统可以提出“建议归类到某个 project”，但不能静默搬运已命名 project 的材料
3. 长期未被引用、未被确认、未被提升的 capture，不应持续高频 resurfacing
4. `Inbox Project` 的 digest 和 resurfacing 应比活跃 project 更保守
5. 低置信输入允许停留在 capture / inbox 候选层，不急于提升成正式 corpus

结论：

> `Inbox Project` 的价值是接住和整理，不是默认把噪音升级成知识。

## 8. 关于“万物都是 Markdown”的更准确说法

当前共识不应表述为：

> 原始文件消失，只剩 Markdown。

更准确的口径应是：

> 任意输入都要归一成可追溯 Markdown 语料层，但原始 source 保留，并与语料建立 provenance 绑定。

这对 PDF、PPT、Excel、图片、视频尤其重要。

## 9. 一句结论

剪贴板在 `Tino AI 2.0` 里的正确位置是：

> `Input Adapter + Capture Pipeline` 的核心通道，而不是知识真相层本身。
