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
  commands: {
    system: {
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
  commands: {
    system: {
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
