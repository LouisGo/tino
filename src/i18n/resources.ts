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
    clipboardPermission: {
      enableDialogTitle: "Enable Accessibility, Then Restart Tino",
      enableDialogBody: [
        "Tino needs macOS Accessibility permission to paste content back into the previous app.",
        "",
        "Turn on Tino in System Settings > Privacy & Security > Accessibility.",
        "After you enable Tino there, fully quit and reopen Tino before trying again.",
        "",
        "On some Macs the checkbox changes immediately, but the running app still needs a restart before paste back can work.",
      ].join("\n"),
      restartDialogTitle: "Restart Tino to Finish Accessibility Setup",
      restartDialogBody: [
        "Accessibility permission now appears to be enabled for Tino.",
        "",
        "To make paste back work reliably, fully quit and reopen Tino before trying again.",
        "",
        "Restart Tino now?",
      ].join("\n"),
      restartDialogConfirm: "Restart Tino Now",
      restartDialogLater: "Later",
      bannerEnableTitle: "Enable Accessibility for paste back, then reopen Tino.",
      bannerEnableDescription:
        "Turn on Tino in System Settings > Privacy & Security > Accessibility. When you come back, Tino will keep checking and remind you to restart if needed.",
      bannerOpenSettingsAction: "Open Accessibility Settings",
      bannerRestartTitle: "Accessibility is enabled. Restart Tino to finish setup.",
      bannerRestartDescription:
        "macOS permission now appears to be on for this app copy, but paste back may still fail until Tino starts fresh.",
      bannerRestartAction: "Restart Tino Now",
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
      providerLabel: "Provider",
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
      mockTextLine1: "Ask tino anything",
      mockTextLine2: "or only say hi :)",
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
        description: "Saved locally with this provider profile.",
        hint: "Paste the API key for this account.",
        label: "API key",
        maskedValue: "Current key: {{key}}",
        placeholder: "Paste your provider key.",
        privateBadge: "Private",
      },
      current: {
        description: "Background AI runs and /ai live review follow this default provider.",
        label: "Default runtime",
        missing: "No default provider selected",
      },
      baseUrl: {
        description: "Use the vendor default or a compatible relay endpoint.",
        hint: "Leave this as-is unless you use a relay.",
        label: "Base URL",
      },
      delete: {
        cancel: "Cancel",
        confirm: "Delete",
        description: "Remove {{name}} ({{vendor}}) from the saved provider list?",
        title: "Delete provider",
      },
      list: {
        add: "Add provider",
        currentActive: "Default",
        delete: "Delete provider",
        description: "Save multiple accounts or relays, then choose which one background AI uses by default.",
        edit: "Edit",
        keepOneHint: "Keep at least one saved provider slot. Clear its fields if you want to disable AI for now.",
        label: "Saved providers",
        useNow: "Use default",
      },
      model: {
        defaultOptionHint: "Use {{model}} unless Home switches models manually.",
        defaultOptionLabel: "Vendor default",
        description: "Sets the default model for this provider.",
        hint: "Default is {{model}}. Home can still switch models temporarily.",
        label: "Default model override",
        placeholder: "Default: {{model}}",
      },
      name: {
        description: "Shown as the provider group label in Home.",
        hint: "Give this provider a short name.",
        label: "Provider name",
        placeholder: "Provider 1",
      },
      vendor: {
        description: "Choose the vendor behind this profile.",
        hint: "Pick the vendor first. Base URL and model override are optional.",
        label: "Vendor",
        placeholder: "Select vendor",
      },
      status: {
        apiKeyNeeded: "API key needed",
        incomplete: "Provider incomplete",
        ready: "Ready",
      },
      test: {
        description: "Run a quick connectivity check for the profile you are editing.",
        disabledBody: "Fill in Base URL and API key first.",
        idleBody: "Use the default prompt or edit it, then run a quick connectivity check.",
        label: "Live provider test",
        meta: "{{responseModel}} · {{finishReason}} · {{durationMs}} ms · in {{inputTokens}} / out {{outputTokens}} tokens",
        pendingBody: "Calling the provider now...",
        promptHint: "A simple hello is enough here.",
        promptLabel: "Test prompt",
        resultLabel: "Latest response",
        run: "Run test",
        running: "Running...",
        supportHint: "Works with direct endpoints and compatible relays.",
        inactiveHint: "Testing {{editing}} only. Click “Use default” if you also want background AI and /ai to use it instead of {{active}}.",
        unknownError: "The provider returned an unknown error.",
      },
    },
    sections: {
      ai: {
        description: "Manage saved providers and choose the default runtime for background AI.",
        eyebrow: "AI Runtime",
        label: "AI",
        title: "Provider Profiles",
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
    clipboardPermission: {
      enableDialogTitle: "先开启辅助功能权限，再重启 Tino",
      enableDialogBody: [
        "Tino 需要 macOS 的辅助功能权限，才能把内容回填到上一个应用。",
        "",
        "请前往“系统设置 > 隐私与安全性 > 辅助功能”，把 Tino 打开。",
        "打开之后，请先彻底退出并重新打开 Tino，再回来重试。",
        "",
        "有些 Mac 上即使勾选已经生效，当前正在运行的 Tino 仍然要重启一次，回填功能才会正常工作。",
      ].join("\n"),
      restartDialogTitle: "重启 Tino，完成辅助功能设置",
      restartDialogBody: [
        "看起来 Tino 的辅助功能权限已经打开了。",
        "",
        "为了让回填功能稳定生效，请先彻底退出并重新打开 Tino。",
        "",
        "现在重启 Tino 吗？",
      ].join("\n"),
      restartDialogConfirm: "立即重启 Tino",
      restartDialogLater: "稍后再说",
      bannerEnableTitle: "先开启辅助功能权限，再重新打开 Tino。",
      bannerEnableDescription:
        "请前往“系统设置 > 隐私与安全性 > 辅助功能”打开 Tino。你回来后，应用会继续检查权限状态，并在需要时提醒你重启。",
      bannerOpenSettingsAction: "打开辅助功能设置",
      bannerRestartTitle: "辅助功能已开启，请重启 Tino 完成设置。",
      bannerRestartDescription:
        "看起来当前这份应用副本的 macOS 权限已经打开了，但在 Tino 重新启动之前，回填仍然可能失败。",
      bannerRestartAction: "立即重启 Tino",
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
      title: "Tino 正在待命",
      placeholder: "问问 Tino，你现在想完成什么...",
      modelLabel: "模型",
      providerLabel: "Provider",
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
      mockTextLine1: "你可以问 tino 任何事",
      mockTextLine2: "碎碎念也可以",
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
        description: "只保存在本地，并跟随这条 provider 配置。",
        hint: "粘贴这个账号对应的 API Key。",
        label: "API Key",
        maskedValue: "当前密钥：{{key}}",
        placeholder: "粘贴你的 provider key。",
        privateBadge: "私密",
      },
      current: {
        description: "后台 AI 和 /ai live review 会跟随这个默认 provider。",
        label: "默认运行时",
        missing: "还没有默认 provider",
      },
      baseUrl: {
        description: "默认用厂商地址，也可以改成兼容中转。",
        hint: "只有走中转时才需要改。",
        label: "Base URL",
      },
      delete: {
        cancel: "取消",
        confirm: "删除",
        description: "要把 {{name}}（{{vendor}}）从已保存的 provider 列表中删除吗？",
        title: "删除 provider",
      },
      list: {
        add: "新增 provider",
        currentActive: "默认项",
        delete: "删除 provider",
        description: "把多个账号或中转保存起来，并指定后台 AI 默认使用哪一个。",
        edit: "编辑",
        keepOneHint: "至少保留一个 provider 槽位；如果你暂时不想启用 AI，可以直接把里面的字段清空。",
        label: "已保存 provider",
        useNow: "设为默认",
      },
      model: {
        defaultOptionHint: "默认使用 {{model}}；首页手动切换时不会改这里。",
        defaultOptionLabel: "厂商默认",
        description: "设置这个 Provider 的默认模型。",
        hint: "默认会走 {{model}}，但首页仍可临时切换。",
        label: "Default Model Override",
        placeholder: "默认：{{model}}",
      },
      name: {
        description: "会显示在首页模型下拉里的 provider 分组标题中。",
        hint: "给这组配置起一个简短名称。",
        label: "Provider 名称",
        placeholder: "Provider 1",
      },
      vendor: {
        description: "选择这条配置对应的厂商。",
        hint: "先选厂商；Base URL 和模型覆盖都按需填写。",
        label: "厂商",
        placeholder: "选择厂商",
      },
      status: {
        apiKeyNeeded: "需要 API Key",
        incomplete: "提供方未完成",
        ready: "已就绪",
      },
      test: {
        description: "对当前正在编辑的配置跑一次快速连通性检查。",
        disabledBody: "请先填好 Base URL 和 API Key。",
        idleBody: "直接用默认提示词就可以，也可以先改一下再测。",
        label: "实时 Provider 测试",
        meta: "{{responseModel}} · {{finishReason}} · {{durationMs}} ms · 输入 {{inputTokens}} / 输出 {{outputTokens}} tokens",
        pendingBody: "正在调用 Provider...",
        promptHint: "这里只需要一个很短的 hello 测试。",
        promptLabel: "测试提示词",
        resultLabel: "最近一次返回",
        run: "运行测试",
        running: "运行中...",
        supportHint: "支持直连官方地址，也支持兼容的中转站。",
        inactiveHint: "这次测试只会命中 {{editing}}；如果也要让后台 AI 和 /ai 改用它，而不是 {{active}}，请点上面的“设为默认”。",
        unknownError: "Provider 返回了未知错误。",
      },
    },
    sections: {
      ai: {
        description: "统一管理已保存 provider，并选择后台 AI 默认使用哪一个。",
        eyebrow: "AI 运行时",
        label: "AI",
        title: "Provider 配置",
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
