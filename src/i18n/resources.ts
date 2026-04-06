import type { AppLocale } from "@/types/shell";

type DeepStringLeaves<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? T
    : {
        readonly [K in keyof T]: DeepStringLeaves<T[K]>;
      };

type TranslationLeafPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]:
        T[K] extends string
          ? K
          : `${K}.${TranslationLeafPaths<T[K]>}`;
    }[keyof T & string];

function defineLocaleSchema<const T extends Record<string, unknown>>(value: T) {
  return value as DeepStringLeaves<T>;
}

export const i18nNamespaces = [
  "common",
  "shell",
  "dashboard",
  "commands",
  "shortcuts",
  "settings",
] as const;

export type I18nNamespace = (typeof i18nNamespaces)[number];

export const fallbackAppLocale = "en-US" as const satisfies AppLocale;
export const supportedAppLocales = [
  "en-US",
  "zh-CN",
] as const satisfies readonly AppLocale[];

export const defaultNamespace = "common" as const;

export const localeLabels: Record<AppLocale, string> = {
  "en-US": "English (US)",
  "zh-CN": "简体中文",
};

export const enUSResources = defineLocaleSchema({
  common: {
    appName: "Tino",
    actions: {
      close: "Close",
      open: "Open",
      refresh: "Refresh",
      restoreAll: "Restore all",
      switchToDark: "Switch to dark",
      switchToLight: "Switch to light",
    },
    labels: {
      active: "Active",
      unassigned: "Unassigned",
    },
    navigation: {
      ai: "AI",
      clipboard: "Clipboard",
      home: "Home",
      settings: "Settings",
    },
  },
  shell: {
    aria: {
      home: "Tino home",
    },
    clipboardWindowTitle: "Clipboard",
    tooltip: {
      home: "Home",
      settings: "Settings",
    },
    tray: {
      clipboard: "Clipboard",
      open: "Open Tino",
      quit: "Quit",
      tooltip: "Tino",
    },
  },
  dashboard: {
    chat: {
      eyebrow: "Hello there,",
      title: "What should Tino help with?",
      placeholder: "Ask Tino anything...",
      modelLabel: "Model",
      attachmentsLabel: "Attachments",
      attachmentsHint: "Attachment UI placeholder. File support will land here later.",
      attachmentsUsage: "{{count}}/{{limit}}",
      attachmentsLimitDialogTitle: "Attachment Limit Reached",
      attachmentsLimitDialogMessage: "You can add up to {{limit}} attachments.",
      attachmentImage: "Image",
      attachmentFile: "File",
      removeAttachment: "Remove attachment",
      dropTitle: "Drop images or files here",
      dropHint: "You can also paste files or images from the clipboard.",
      expandInput: "Expand input",
      collapseInput: "Collapse input",
      mockTextTitle: "focused-draft.txt",
      mockTextNote: "Tone: cleaner, calmer, and easier to scan.",
      mockTextSecondaryTitle: "brief-outline.md",
      mockTextSecondaryNote: "A shorter prompt structure for the next pass.",
      mockTextLine1: "Turn these materials",
      mockTextLine2: "into a calmer home concept",
      mockFileName: "homepage-brief.md",
      mockFileMeta: "Markdown · 18 KB",
      mockFileSecondaryName: "launch-notes.pdf",
      mockFileSecondaryMeta: "PDF · 2 pages",
      mockImageName: "hero-reference.png",
      mockImageMeta: "Visual reference",
      mockImageSecondaryName: "glass-study.jpg",
      mockImageSecondaryMeta: "Material reference",
      send: "Send",
      setupHint: "Complete the AI provider settings before starting a conversation.",
      providerHint: "Ready on {{provider}}.",
      resultLabel: "Latest Response",
      thinking: "Thinking...",
      errorFallback: "The request failed before a response was returned.",
      suggestion1: "Summarize my latest notes into three bullets",
      suggestion2: "Draft a concise reply for this message",
      suggestion3: "Help me think through a task step by step",
      suggestion4: "Rewrite this paragraph to sound clearer",
    },
    hero: {
      eyebrow: "Control Tower",
      title: "Clipboard capture now lands in `daily/*.md` through the Rust runtime.",
      description:
        "The shell remains narrow on purpose: keep capture reliable, expose just enough recent state to verify it, and use a dedicated board for richer clipboard inspection.",
      refresh: "Refresh Snapshot",
    },
    cards: {
      knowledgeRoot: {
        label: "Knowledge Root",
        description: "Current archive workspace used by Rust-side file writes.",
        actionLabel: "Open knowledge root in file manager",
        fallbackValue: "~/tino-inbox",
      },
      queuePolicy: {
        label: "Queue Policy",
        description: "Frozen hybrid batch rule reserved for the next milestone.",
        fallbackValue: "20 captures or 10 minutes",
      },
      runtime: {
        label: "Runtime",
        description: "{{os}} · {{captureMode}}",
        fallbackOs: "browser",
        fallbackCaptureMode: "Rust clipboard poller active",
      },
    },
    sections: {
      workspace: {
        eyebrow: "Focus",
        title: "Workspace Overview",
        description:
          "Keep Home lean: just the current archive location, capture runtime, and a direct path into Settings.",
      },
      clipboard: {
        eyebrow: "Recent Activity",
        title: "Recent Clipboard",
        description:
          "The latest captures stay visible here. Use the board when you need search, filtering, and full preview.",
        actionLabel: "Open Clipboard Board",
        empty: "No captures yet.",
      },
      ai: {
        title: "AI Batch Review",
        description:
          "Phase 2 adds one manual live candidate run: Rust exposes ready batches, the renderer calls the model for a structured result, and the apply step still remains non-persistent.",
        actionLabel: "Open Batch Review",
        item1: "Rust IPC DTO and command boundaries are now reserved for AI batches.",
        item2: "Renderer now owns the model schema, prompt/context assembly, runtime state machine, and manual candidate run.",
        item3: "Persistence is intentionally blocked until the knowledge output phase is connected.",
      },
    },
    fields: {
      runtime: {
        description: "Current app runtime and clipboard watch status.",
      },
    },
    kindLabels: {
      plainText: "Text",
      richText: "Rich Text",
      link: "Link",
      image: "Image",
    },
  },
  commands: {
    system: {
      navigateAi: {
        label: "Navigate AI",
      },
      navigateClipboard: {
        label: "Navigate Clipboard",
      },
      navigateHome: {
        label: "Navigate Home",
      },
      navigateSettings: {
        label: "Navigate Settings",
      },
      openExternalTarget: {
        label: "Open Target",
      },
      openImageInPreview: {
        label: "Open In Preview",
      },
      revealPath: {
        label: "Reveal In File Manager",
      },
      toggleClipboardWindowVisibility: {
        label: "Toggle Clipboard Window Visibility",
      },
      toggleMainWindowVisibility: {
        label: "Toggle Main Window Visibility",
      },
      toggleThemeMode: {
        label: "Toggle Theme Mode",
      },
    },
  },
  shortcuts: {
    shell: {
      openAi: {
        description: "Navigate to the AI review route inside the main shell.",
        label: "Open AI Page",
      },
      openClipboard: {
        description: "Navigate to the clipboard route inside the main shell.",
        label: "Open Clipboard Page",
      },
      openHome: {
        description: "Navigate to the dashboard inside the main shell.",
        label: "Open Home",
      },
      openSettings: {
        description: "Navigate to the settings route inside the main shell.",
        label: "Open Settings",
      },
      toggleClipboardWindow: {
        description: "Quick open or hide the clipboard window from anywhere.",
        label: "Toggle Clipboard Window",
      },
      toggleMainWindow: {
        description: "Show or hide the main Tino window from anywhere.",
        label: "Toggle Main Window",
      },
      toggleThemeMode: {
        description: "Toggle between the current light and dark theme modes.",
        label: "Toggle Theme Mode",
      },
    },
  },
  settings: {
    actions: {
      restoreAllShortcuts: "Restore all shortcuts",
    },
    appearance: {
      language: {
        currentValue: "Currently using {{locale}}.",
        description: "Switch immediately between English and Simplified Chinese.",
        label: "Language",
      },
      mode: {
        description: "Light, dark, or system.",
        label: "Appearance mode",
        options: {
          dark: "Dark",
          light: "Light",
          system: "System",
        },
      },
      palette: {
        active: "Active",
        description: "Shell color system.",
        label: "Palette",
      },
    },
    badges: {
      appliesInstantly: "Applies instantly",
    },
    navigation: {
      sectionsAriaLabel: "Settings sections",
    },
    provider: {
      apiKey: {
        description: "Saved with app settings. The UI keeps the middle characters hidden.",
        hint: "Paste your provider key. It stays masked in the interface.",
        label: "API key",
        maskedValue: "Current key: {{key}}",
        placeholder: "Paste your provider key.",
        privateBadge: "Private",
      },
      baseUrl: {
        description: "HTTPS endpoint for your OpenAI-compatible provider.",
        hint: "Leave it on the default OpenAI path or point it at a compatible relay.",
        label: "Base URL",
      },
      model: {
        description: "Pick from the shared OpenAI model catalog.",
        hint: "Manual model entry is disabled for now.",
        label: "Model",
        placeholder: "Select a model",
      },
      status: {
        apiKeyNeeded: "API key needed",
        incomplete: "Provider incomplete",
        ready: "Ready",
      },
      test: {
        description: "Send a simple prompt through the current Base URL, model, and API key.",
        disabledBody: "Fill in Base URL, model, and API key first, then run the live check.",
        idleBody: "Use the default prompt or edit it, then run a live call to verify the provider path.",
        label: "Live provider test",
        meta: "{{responseModel}} · {{finishReason}} · {{durationMs}} ms · in {{inputTokens}} / out {{outputTokens}} tokens",
        pendingBody: "Calling the provider now...",
        promptHint: "A quick smoke test is enough here - for example, ask it to say hello.",
        promptLabel: "Test prompt",
        resultLabel: "Latest response",
        run: "Run test",
        running: "Running...",
        supportHint: "Works with direct OpenAI endpoints and OpenAI-compatible relays such as OpenRouter.",
        unknownError: "The provider returned an unknown error.",
      },
    },
    sections: {
      ai: {
        description: "Keep endpoint, model, and key together.",
        eyebrow: "Runtime Provider",
        label: "AI",
        title: "Provider & model",
      },
      appearance: {
        description: "Choose the mode and palette for the shell.",
        eyebrow: "Live Preview",
        label: "Appearance",
        title: "Theme & shell look",
      },
      automation: {
        description: "Control capture, launch behavior, and logs.",
        eyebrow: "Runtime Controls",
        label: "Automation",
        title: "Automation & diagnostics",
      },
      shortcuts: {
        description: "Edit global bindings and keep local shortcuts visible.",
        eyebrow: "Interaction Layer",
        label: "Shortcuts",
        title: "Keyboard shortcuts",
      },
      workspace: {
        description: "Set the archive path and the clipboard history window.",
        eyebrow: "Core Pathing",
        label: "Workspace",
        title: "Workspace & storage",
      },
    },
  },
});

export type TranslationSchema = typeof enUSResources;
export type TranslationKey<Namespace extends I18nNamespace = I18nNamespace> =
  TranslationLeafPaths<TranslationSchema[Namespace]>;

export const zhCNResources = {
  common: {
    appName: "Tino",
    actions: {
      close: "关闭",
      open: "打开",
      refresh: "刷新",
      restoreAll: "全部恢复",
      switchToDark: "切换到深色",
      switchToLight: "切换到浅色",
    },
    labels: {
      active: "当前使用",
      unassigned: "未分配",
    },
    navigation: {
      ai: "AI",
      clipboard: "剪贴板",
      home: "首页",
      settings: "设置",
    },
  },
  shell: {
    aria: {
      home: "Tino 首页",
    },
    clipboardWindowTitle: "剪贴板",
    tooltip: {
      home: "首页",
      settings: "设置",
    },
    tray: {
      clipboard: "剪贴板",
      open: "打开 Tino",
      quit: "退出",
      tooltip: "Tino",
    },
  },
  dashboard: {
    chat: {
      eyebrow: "你好，",
      title: "想让 Tino 帮你做什么？",
      placeholder: "问问 Tino，你现在想完成什么...",
      modelLabel: "模型",
      attachmentsLabel: "附件",
      attachmentsHint: "这里只先做附件入口占位，后面会接入真实文件能力。",
      attachmentsUsage: "{{count}}/{{limit}}",
      attachmentsLimitDialogTitle: "附件数量已达上限",
      attachmentsLimitDialogMessage: "最多只能添加 {{limit}} 个附件。",
      attachmentImage: "图片",
      attachmentFile: "文件",
      removeAttachment: "移除附件",
      dropTitle: "将图片或文件拖到这里",
      dropHint: "也可以直接从剪贴板粘贴文件或图片。",
      expandInput: "展开输入区",
      collapseInput: "收起输入区",
      mockTextTitle: "focused-draft.txt",
      mockTextNote: "语气更克制，视觉更透气，更容易扫读。",
      mockTextSecondaryTitle: "brief-outline.md",
      mockTextSecondaryNote: "下一轮可以继续压缩成更短的提示结构。",
      mockTextLine1: "把这组素材",
      mockTextLine2: "整理成首页提案",
      mockFileName: "homepage-brief.md",
      mockFileMeta: "Markdown · 18 KB",
      mockFileSecondaryName: "launch-notes.pdf",
      mockFileSecondaryMeta: "PDF · 2 页",
      mockImageName: "hero-reference.png",
      mockImageMeta: "视觉参考",
      mockImageSecondaryName: "glass-study.jpg",
      mockImageSecondaryMeta: "材质参考",
      send: "发送",
      setupHint: "先完成 AI Provider 设置，才能开始对话。",
      providerHint: "当前使用 {{provider}}。",
      resultLabel: "最近一次响应",
      thinking: "正在思考...",
      errorFallback: "请求失败，暂时没有拿到响应。",
      suggestion1: "把我最近的笔记总结成三条重点",
      suggestion2: "帮我起草一条简洁的回复",
      suggestion3: "陪我一步一步理清一个任务",
      suggestion4: "把这段话改写得更清楚",
    },
    hero: {
      eyebrow: "控制塔",
      title: "剪贴板采集现在会通过 Rust 运行时写入 `daily/*.md`。",
      description:
        "这个壳层刻意保持克制：先把采集链路做稳，只暴露足够的近期状态用于核验，更完整的剪贴板检查放到专用面板里处理。",
      refresh: "刷新快照",
    },
    cards: {
      knowledgeRoot: {
        label: "知识根目录",
        description: "Rust 侧文件写入当前使用的归档工作区。",
        actionLabel: "在文件管理器中打开知识根目录",
        fallbackValue: "~/tino-inbox",
      },
      queuePolicy: {
        label: "队列策略",
        description: "为下一个里程碑预留的固定混合批处理规则。",
        fallbackValue: "20 条剪贴板或 10 分钟",
      },
      runtime: {
        label: "运行时",
        description: "{{os}} · {{captureMode}}",
        fallbackOs: "浏览器",
        fallbackCaptureMode: "Rust 剪贴板轮询器运行中",
      },
    },
    sections: {
      workspace: {
        eyebrow: "聚焦信息",
        title: "工作区概览",
        description: "首页只保留当前归档位置、采集运行状态，以及进入设置的直接入口。",
      },
      clipboard: {
        eyebrow: "最近活动",
        title: "最近剪贴板",
        description:
          "这里只保留最近几条记录；当你需要搜索、筛选和完整预览时，再进入剪贴板面板。",
        actionLabel: "打开剪贴板面板",
        empty: "还没有剪贴板记录。",
      },
      ai: {
        title: "AI 批次复核",
        description:
          "第一阶段从契约优先的复核开始：Rust 暴露可直接消费的批次边界，渲染层校验 mock 结构化结果，apply 步骤暂时仍不落盘。",
        actionLabel: "打开批次复核",
        item1: "Rust IPC DTO 与命令边界已经为 AI 批次流程预留。",
        item2: "渲染层负责模型 schema、运行时状态机和 mock 复核闭环。",
        item3: "在复核契约稳定之前，持久化能力会继续保持关闭。",
      },
    },
    fields: {
      runtime: {
        description: "当前应用运行环境和剪贴板采集状态。",
      },
    },
    kindLabels: {
      plainText: "文本",
      richText: "富文本",
      link: "链接",
      image: "图片",
    },
  },
  commands: {
    system: {
      navigateAi: {
        label: "前往 AI",
      },
      navigateClipboard: {
        label: "前往剪贴板",
      },
      navigateHome: {
        label: "前往首页",
      },
      navigateSettings: {
        label: "前往设置",
      },
      openExternalTarget: {
        label: "打开目标",
      },
      openImageInPreview: {
        label: "在预览中打开",
      },
      revealPath: {
        label: "在文件管理器中显示",
      },
      toggleClipboardWindowVisibility: {
        label: "切换剪贴板窗口显示",
      },
      toggleMainWindowVisibility: {
        label: "切换主窗口显示",
      },
      toggleThemeMode: {
        label: "切换主题模式",
      },
    },
  },
  shortcuts: {
    shell: {
      openAi: {
        description: "在主壳层内切换到 AI 复核页面。",
        label: "打开 AI 页面",
      },
      openClipboard: {
        description: "在主壳层内切换到剪贴板页面。",
        label: "打开剪贴板页面",
      },
      openHome: {
        description: "在主壳层内切换到仪表盘。",
        label: "打开首页",
      },
      openSettings: {
        description: "在主壳层内切换到设置页面。",
        label: "打开设置",
      },
      toggleClipboardWindow: {
        description: "在任何位置快速打开或隐藏剪贴板窗口。",
        label: "切换剪贴板窗口",
      },
      toggleMainWindow: {
        description: "在任何位置显示或隐藏 Tino 主窗口。",
        label: "切换主窗口",
      },
      toggleThemeMode: {
        description: "在当前浅色和深色主题模式之间切换。",
        label: "切换主题模式",
      },
    },
  },
  settings: {
    actions: {
      restoreAllShortcuts: "恢复全部快捷键",
    },
    appearance: {
      language: {
        currentValue: "当前使用 {{locale}}。",
        description: "可在英文和简体中文之间立即切换。",
        label: "语言",
      },
      mode: {
        description: "浅色、深色或跟随系统。",
        label: "外观模式",
        options: {
          dark: "深色",
          light: "浅色",
          system: "系统",
        },
      },
      palette: {
        active: "当前使用",
        description: "应用界面的配色系统。",
        label: "色板",
      },
    },
    badges: {
      appliesInstantly: "即时生效",
    },
    navigation: {
      sectionsAriaLabel: "设置分区",
    },
    provider: {
      apiKey: {
        description: "与应用设置一起保存，界面里会隐藏中间字符。",
        hint: "粘贴你的 provider key，界面里会默认遮挡显示。",
        label: "API Key",
        maskedValue: "当前密钥：{{key}}",
        placeholder: "粘贴你的 provider key。",
        privateBadge: "私密",
      },
      baseUrl: {
        description: "面向 OpenAI Compatible Provider 的 HTTPS 接口地址。",
        hint: "可以保留默认 OpenAI 地址，或改成兼容的中转地址。",
        label: "Base URL",
      },
      model: {
        description: "从统一的 OpenAI 模型目录中选择。",
        hint: "当前阶段不支持手动输入模型名。",
        label: "Model",
        placeholder: "选择模型",
      },
      status: {
        apiKeyNeeded: "需要 API Key",
        incomplete: "提供方未完成",
        ready: "已就绪",
      },
      test: {
        description: "用当前的 Base URL、模型和 API Key 发送一个简单请求。",
        disabledBody: "请先填好 Base URL、模型和 API Key，再运行实时检查。",
        idleBody: "你可以直接用默认提示词，也可以先改一下，再发起一次实时调用。",
        label: "实时 Provider 测试",
        meta: "{{responseModel}} · {{finishReason}} · {{durationMs}} ms · 输入 {{inputTokens}} / 输出 {{outputTokens}} tokens",
        pendingBody: "正在调用 Provider...",
        promptHint: "这里做一个简单 smoke test 就够了，比如让它说一句 hello。",
        promptLabel: "测试提示词",
        resultLabel: "最近一次返回",
        run: "运行测试",
        running: "运行中...",
        supportHint: "既支持直连 OpenAI，也支持 OpenRouter 这类 OpenAI Compatible 中转站。",
        unknownError: "Provider 返回了未知错误。",
      },
    },
    sections: {
      ai: {
        description: "把接口地址、模型和密钥放在一起管理。",
        eyebrow: "运行时提供方",
        label: "AI",
        title: "提供方与模型",
      },
      appearance: {
        description: "选择应用外观模式和色板。",
        eyebrow: "实时预览",
        label: "外观",
        title: "主题与界面风格",
      },
      automation: {
        description: "控制采集、开机启动和日志。",
        eyebrow: "运行时控制",
        label: "自动化",
        title: "自动化与诊断",
      },
      shortcuts: {
        description: "编辑全局绑定，并保留应用内快捷键参考。",
        eyebrow: "交互层",
        label: "快捷键",
        title: "键盘快捷键",
      },
      workspace: {
        description: "设置归档路径和剪贴板历史窗口。",
        eyebrow: "核心路径",
        label: "工作区",
        title: "工作区与存储",
      },
    },
  },
} satisfies TranslationSchema;

export const localeResources: Record<AppLocale, TranslationSchema> = {
  "en-US": enUSResources,
  "zh-CN": zhCNResources,
};
