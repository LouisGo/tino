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
  "clipboard",
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
      moreInfo: "More info",
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
      startupDialogTitle: "Set Up Accessibility Before You Need Paste Back",
      startupDialogBody: [
        "Tino can ask for macOS Accessibility permission now, so clipboard paste back is less likely to interrupt you later.",
        "",
        "After you continue, Tino will open System Settings > Privacy & Security > Accessibility.",
        "Turn on Tino there, then fully quit and reopen the app to finish setup.",
      ].join("\n"),
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
    clipboardPreview: {
      enlarge: "Enlarge",
      ocrResult: "OCR Result",
      ocrDialogTitle: "OCR Result",
      copyCodeBlock: "Copy code",
      copyOcrResult: "Copy OCR Result",
      copiedToClipboard: "Copied to clipboard",
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
  clipboard: {
    board: {
      title: "Clipboard",
      status: {
        loading: "Loading",
        readError: "Read error",
        captureCount: "{{count}} items",
      },
      summary: {
        active: "Active",
        waiting: "Waiting for recent history",
        noCapturesYet: "No captures yet",
        percentOfRecent: "{{percent}}% of recent captures",
        recentLoadingHint: "Loading recent history",
        recentErrorHint: "Recent history unavailable",
        recentWindow: "Recent {{days}}-day window",
      },
    },
    filters: {
      all: {
        label: "All Entries",
        shortLabel: "All",
      },
      text: {
        label: "Text",
        shortLabel: "Text",
      },
      link: {
        label: "Links",
        shortLabel: "Links",
      },
      image: {
        label: "Images",
        shortLabel: "Images",
      },
      video: {
        label: "Videos",
        shortLabel: "Videos",
      },
      file: {
        label: "Files",
        shortLabel: "Files",
      },
    },
    empty: {
      retry: "Retry",
      loadingTitle: "Loading clipboard history",
      loadingDescription: "Recent clipboard history is being prepared.",
      errorTitle: "Could not load clipboard history",
      defaultTitle: "Clipboard is empty",
      defaultDescription: "Copy text, links, or images on macOS and recent captures will appear here.",
      filteredTitle: "No matching captures",
      filteredDescription: "Try clearing the search term or switching the type filter back to all entries.",
      imagePreviewUnavailableTitle: "Preview unavailable",
      imagePreviewUnavailableDescription: "The local preview asset could not be loaded into the board.",
      enlargedPreviewUnavailableDescription: "The image asset could not be loaded for enlarged preview.",
    },
    groups: {
      pinned: "Pinned",
      today: "Today",
      yesterday: "Yesterday",
      loadingOlder: "Loading older captures",
    },
    capture: {
      moreActions: "More actions",
      thumbnailAlt: {
        image: "Image thumbnail",
        video: "Video thumbnail",
      },
      sourceUnknown: "Unknown source",
      kinds: {
        text: "Text",
        richText: "Rich Text",
        link: "Link",
        image: "Image",
        video: "Video",
        file: "File",
      },
      status: {
        archived: "Archived",
        filtered: "Filtered",
      },
      detail: {
        sourceApp: "Source App",
        contentType: "Type",
        path: "Path",
        availability: "Availability",
        characters: "Characters",
        words: "Words",
        dimensions: "Dimensions",
        imageSize: "Size",
        url: "URL",
        host: "Domain",
        captured: "Captured",
        bundleId: "Bundle ID",
        unavailableValue: "Unavailable",
        unavailableShort: "Unavailable",
        richTextValue: "Rich Text",
        linesAndChars: "{{lines}} lines · {{chars}} chars",
        sourceAppIconAlt: "{{appName}} icon",
      },
    },
    actions: {
      copyAgain: "Copy Again",
      openLink: "Open Link",
      openImageViewer: "Open Image Viewer",
      openInPreview: "Open in Preview",
      open: "Open",
      revealFile: "Reveal File",
      revealAsset: "Reveal Asset",
      pinToTop: "Pin to Top",
      unpin: "Unpin",
      deleteCapture: "Delete Capture",
      enlarge: "Enlarge",
    },
    dialogs: {
      cancel: "Cancel",
      gotIt: "Got it",
      pinLimit: {
        title: "Replace oldest pinned capture?",
        description: "You can keep up to 5 pinned captures. Pinning this item will replace “{{oldest}}”.",
        oldestFallback: "the oldest pinned capture",
        confirm: "Replace oldest",
        pending: "Pinning...",
      },
      deleteCapture: {
        title: "Delete this clipboard capture?",
        description: "This will remove the item from clipboard history and the local board cache.",
        confirm: "Delete capture",
        pending: "Deleting...",
      },
      shortcuts: {
        title: "Clipboard shortcuts",
        actionHeader: "Action",
        shortcutHeader: "Shortcut",
        rows: {
          openSelectedCapture: "Open the selected item in its native app",
          openActions: "Open actions for the selected item",
          moveBetweenCaptures: "Move through captures",
          jumpToEdges: "Jump to the first or last capture",
          pasteBack: "Paste the selected item back",
          pasteFloating: "Paste the selected item back in the floating window",
          dismiss: "Close preview or dismiss the floating window",
        },
      },
    },
    window: {
      pasteToTarget: "Paste to {{appName}}",
      pasteToPreviousApp: "Paste to previous app",
      shortcutsButtonAria: "Open clipboard shortcuts",
      pauseStatusButtonAria: "Open paused capture status",
      capturePaused: {
        title: "Capture is paused",
        description: "Tino is not collecting new clipboard items right now. Resume here whenever you want capture to start again.",
        resume: "Resume capture",
        pending: "Resuming...",
        dismiss: "Dismiss paused capture tip",
      },
    },
    toolbar: {
      searchPlaceholder: "Search history or use app:/date:/type:",
      clearSearch: "Clear search",
      filterAria: "Filter capture types",
    },
    preview: {
      titles: {
        imageWithDimensions: "Image ({{width}}×{{height}})",
        imageFallback: "Image capture",
        linkFallback: "Link capture",
        formattedTextFallback: "Formatted text",
        textFallback: "Text capture",
      },
      tabs: {
        markdown: "Markdown",
        richText: "Rich Text",
        text: "Text",
        html: "HTML",
        rawRich: "Raw Rich",
        raw: "Raw",
      },
      noRawSource: "No raw source available.",
      closePreview: "Close preview",
      linkOpen: "Open link",
      file: {
        imagePreviewAlt: "Image preview",
        videoPreviewTitle: "Video preview",
        audioFallbackTitle: "Audio file",
        audioHint: "Use the native player controls to preview this audio file.",
        referenceFallbackTitle: "File reference",
        missingWarning: "The original file can no longer be found at the saved path.",
        pdfFrameTitle: "PDF preview: {{name}}",
        descriptions: {
          missing: "The file reference remains, but the original file is no longer available at that path.",
          failed: "Preview could not be loaded. You can still open the file or reveal it in Finder.",
          image: "Image file captured from the clipboard.",
          video: "Video file captured from the clipboard.",
          audio: "Audio file captured from the clipboard.",
          pdf: "PDF document captured from the clipboard.",
          presentation: "Presentation captured from the clipboard.",
          spreadsheet: "Spreadsheet captured from the clipboard.",
          document: "Document captured from the clipboard.",
          markdown: "Markdown file captured from the clipboard.",
          code: "Code or configuration file captured from the clipboard.",
          archive: "{{type}} captured from the clipboard.",
          unknown: "File reference captured from the clipboard.",
          default: "File reference captured from the clipboard.",
        },
      },
      video: {
        play: "Play video",
        pause: "Pause video",
        seek: "Seek video",
        mute: "Mute video",
        unmute: "Unmute video",
      },
    },
    fileTypes: {
      imageFile: "Image file",
      video: "Video",
      audioFile: "Audio file",
      pdfDocument: "PDF document",
      presentation: "Presentation",
      spreadsheet: "Spreadsheet",
      document: "Document",
      markdown: "Markdown file",
      codeFile: "Code file",
      package: "Package",
      archive: "Archive",
      unknownFileType: "File",
    },
    errors: {
      historyLoadFailed: "Could not load clipboard history.",
      pasteBackFailed: "Clipboard content could not be returned to the previous app.",
      pasteBackFailedWithDetail: "Clipboard content could not be returned to the previous app.\n\nDetails: {{detail}}",
      dialogTitles: {
        packagedPreviewRequired: "Packaged Preview App Required",
        localSigningRequired: "Local Signing Required",
        reinstallPreviewApp: "Reinstall Preview App",
        clipboardReturnFailed: "Clipboard Return Failed",
      },
      dialogBodies: {
        packagedPreviewRequired: "Paste back requires the packaged Preview app instead of a raw development build.",
        localSigningRequired: "Paste back requires a locally signed Preview app. Run `pnpm macos:setup-local-signing`, then rebuild and reinstall the Preview app.",
        reinstallPreviewApp: "The installed Preview app signature does not match the current build. Rebuild and reinstall the latest Preview app, then try again.",
      },
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
      openPathInDefaultApp: {
        label: "Open In Default App",
        errorTitle: "Could Not Open File",
        errorBody: [
          "Tino could not open this file with the system default app.",
          "",
          "Path: {{path}}",
          "Reason: {{reason}}",
          "",
          "Use Reveal to locate the original file manually.",
        ].join("\n"),
        errorReasonFallback: "Unknown error",
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
        description: "Switch the interface language immediately.",
        label: "Language",
      },
      mode: {
        description: "Light, dark, or follow the system setting.",
        label: "Appearance mode",
        options: {
          dark: "Dark",
          light: "Light",
          system: "System",
        },
      },
      palette: {
        active: "Active",
        description: "Application color theme.",
        label: "Palette",
        options: {
          ocean: "Ocean",
          tino: "Tino",
        },
      },
    },
    archive: {
      root: {
        info: "Tino writes daily archives and AI output under this folder.",
        label: "Archive folder",
        pick: "Pick folder",
        placeholder: "~/tino-inbox",
        reveal: "Reveal",
      },
    },
    app: {
      launchAtLogin: {
        disabled: "Disabled",
        enabled: "Enabled",
        info: "Controls whether Tino starts automatically after sign-in.",
        label: "Launch at login",
        toggle: "Toggle",
        updating: "Updating",
      },
      logs: {
        info: "Open the runtime log directory for diagnostics.",
        label: "Logs",
        open: "Open logs",
      },
      shortcuts: {
        label: "Shortcuts",
        summary: "Global and in-app bindings",
      },
    },
    badges: {
      appliesInstantly: "Applies instantly",
      configured: "Configured",
      experimental: "WIP",
      needsAttention: "Needs attention",
      paused: "Paused",
      running: "Running",
    },
    clipboard: {
      capture: {
        pause: "Pause capture",
        resume: "Resume capture",
        confirmPause: {
          title: "Pause clipboard capture?",
          description: "New clipboard items will stop being collected until you resume capture from Settings or the clipboard page.",
          cancel: "Cancel",
          confirm: "Pause capture",
          pending: "Pausing...",
        },
      },
      keywords: {
        info: "Semicolon-separated keywords. Matching is case-insensitive, and skipped captures",
        label: "Ignored keywords",
        placeholder: "password; verification code; internal only",
      },
      retention: {
        info: "Controls how much clipboard history is shown in app data. Older cached entries can be restored when you expand the window again, while cache older than 90 days is cleaned up automatically. It does not prune long-lived Markdown assets.",
        label: "History retention",
        options: {
          ninetyDays: {
            label: "90 days",
            tone: "Maximum",
          },
          oneDay: {
            label: "1 day",
            tone: "Tight",
          },
          sevenDays: {
            label: "7 days",
            tone: "Extended",
          },
          threeDays: {
            label: "3 days",
            tone: "Balanced",
          },
        },
      },
      sourceApps: {
        empty: "No ignored apps yet.",
        info: "Search installed apps inline. will ignored captures from these apps",
        label: "Ignored apps",
        loadError: "Failed to load installed apps.",
        loading: "Loading installed apps...",
        noMatch: "No apps matched this search.",
        remove: "Remove {{appName}} from ignored apps",
        searchPlaceholder: "Search apps...",
      },
    },
    navigation: {
      sectionsAriaLabel: "Settings sections",
    },
    provider: {
      advanced: {
        label: "Advanced",
        summary: "Base URL, model, connectivity test",
      },
      apiKey: {
        description: "Saved locally with this service profile.",
        hint: "Paste the API key for this account.",
        label: "API key",
        maskedValue: "Current key: {{key}}",
        placeholder: "Paste your provider key.",
        privateBadge: "Private",
      },
      current: {
        description: "Background AI runs and /ai review use this default profile.",
        label: "Default service",
        missing: "No default profile selected",
      },
      baseUrl: {
        description: "Use the vendor default or a compatible relay endpoint.",
        hint: "Leave this as-is unless you use a relay.",
        label: "Base URL",
      },
      delete: {
        cancel: "Cancel",
        confirm: "Delete",
        description: "Remove {{name}} ({{vendor}}) from saved profiles?",
        title: "Delete profile",
      },
      list: {
        add: "Add profile",
        currentActive: "Default",
        delete: "Delete profile",
        description: "Save multiple accounts or relays, then choose which one background AI uses by default.",
        edit: "Edit",
        editing: "Editing",
        keepOneHint: "Keep at least one saved profile. Clear its fields if you want to disable AI for now.",
        label: "Saved profiles",
        useNow: "Use default",
      },
      model: {
        defaultOptionHint: "Use {{model}} unless Home switches models manually.",
        defaultOptionLabel: "Vendor default",
        description: "Sets the default model for this profile.",
        hint: "Default is {{model}}. Home can still switch models temporarily.",
        label: "Default model override",
        options: {
          deepseekChat: {
            description: "Default DeepSeek model for general work.",
          },
          deepseekReasoner: {
            description: "Reasoning-focused DeepSeek model.",
          },
          gpt54: {
            description: "Higher-capability GPT model.",
          },
          gpt54Mini: {
            description: "Faster GPT-5.4 variant.",
          },
        },
        placeholder: "Default: {{model}}",
      },
      name: {
        description: "Shown as the profile group label in Home.",
        generatedLabel: "Profile",
        hint: "Give this profile a short name.",
        label: "Profile name",
        placeholder: "Provider 1",
      },
      vendor: {
        description: "Choose the vendor behind this profile.",
        hint: "Pick the vendor first. Base URL and model override are optional.",
        label: "Vendor",
        options: {
          deepseek: {
            description: "DeepSeek direct endpoints or compatible DeepSeek relays.",
          },
          openai: {
            description: "OpenAI official endpoints or OpenAI-compatible relays.",
          },
        },
        placeholder: "Select vendor",
      },
      status: {
        apiKeyNeeded: "API key needed",
        incomplete: "Provider incomplete",
        ready: "Ready",
      },
      test: {
        description: "Run a lightweight connectivity check for the current profile.",
        disabledBody: "Fill in Base URL and API key first.",
        errors: {
          apiKeyRequired: "API key is required before testing.",
          baseUrlRequired: "Base URL is required before testing.",
          fetchUnavailable: "The current runtime cannot send provider requests right now.",
          incompleteResponse: "The provider finished early before returning a complete response.",
          modelUnavailable: "{{host}} does not currently provide model “{{model}}”. Try another model or profile.",
          nonJsonResponse: "The provider returned a non-JSON response, not an OpenAI-compatible API payload.",
          nonJsonResponseWithV1Hint:
            "The provider returned a non-JSON response. If this is a relay, try a Base URL ending in /v1.",
          requestBlocked:
            "The request was blocked before a response arrived. In webview/browser mode, this is usually a CORS or relay preflight issue.",
          timeout:
            "The response timed out before a complete result arrived. Check the network or try another endpoint.",
        },
        idleBody: "Runs one simple connectivity check for this profile.",
        label: "Connectivity test",
        pendingBody: "Testing connection...",
        run: "Run test",
        running: "Running...",
        successBody: "Connection succeeded.",
        inactiveHint: "Testing {{editing}} only. Click “Use default” if you also want background AI and /ai to use it instead of {{active}}.",
        unknownError: "The provider returned an unknown error.",
      },
      validation: {
        apiKeyTooShort: "API key looks too short.",
        apiKeyWhitespace: "API key cannot contain spaces or line breaks.",
        baseUrlCredentialsNotAllowed: "Do not include credentials in Base URL.",
        baseUrlHttpsOnly: "Use an https:// endpoint.",
        baseUrlInvalid: "Enter a valid URL.",
        modelWhitespace: "Model id cannot contain spaces or line breaks.",
        nameRequired: "Enter a profile name.",
        vendorUnsupported: "Choose a supported vendor.",
      },
    },
    shortcuts: {
      actions: {
        disable: "Disable shortcut",
        record: "Record shortcut",
        restoreDefault: "Restore default",
        stopRecording: "Stop recording",
      },
      badges: {
        custom: "Custom",
        off: "Off",
        readOnly: "Read only",
        recording: "Recording",
      },
      groups: {
        global: {
          label: "System-wide",
          note: "Works outside the app and saves immediately.",
        },
        local: {
          label: "In app",
          note: "Reference only.",
        },
      },
      messages: {
        cancelled: "Recording cancelled.",
        cancelledOnBlur: "Recording cancelled because the window lost focus.",
        conflict: "Already used by {{labels}}. Choose another shortcut or restore the other one first.",
        listening: "Listening for the next shortcut. Press `Esc` to cancel.",
        modifierOnly: "Modifier keys cannot be used on their own. Hold them and press one main key.",
      },
    },
    sections: {
      ai: {
        description: "Optional provider setup for live review and future background AI.",
        eyebrow: "Processing",
        label: "AI",
        title: "AI",
      },
      app: {
        description: "Shell preferences, launch behavior, diagnostics, and shortcut editing.",
        eyebrow: "Shell",
        label: "App",
        title: "App",
      },
      archive: {
        description: "Choose where Tino writes daily archives and downstream outputs.",
        eyebrow: "Output",
        label: "Archive",
        title: "Archive",
      },
      clipboard: {
        description: "Control capture status, clipboard history retention, and ignore rules.",
        eyebrow: "Input",
        label: "Clipboard",
        title: "Clipboard",
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
      moreInfo: "更多信息",
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
      startupDialogTitle: "建议现在先完成辅助功能授权",
      startupDialogBody: [
        "Tino 可以现在就请求 macOS 的辅助功能权限，这样后面在剪贴板回填时就尽量不用再次打断你。",
        "",
        "继续后，Tino 会打开“系统设置 > 隐私与安全性 > 辅助功能”。",
        "请在那里把 Tino 打开，然后彻底退出并重新打开应用，完成设置。",
      ].join("\n"),
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
    clipboardPreview: {
      enlarge: "放大查看",
      ocrResult: "识别结果",
      ocrDialogTitle: "识别结果",
      copyCodeBlock: "复制代码",
      copyOcrResult: "复制识别结果",
      copiedToClipboard: "已复制到剪贴板",
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
  clipboard: {
    board: {
      title: "剪贴板",
      status: {
        loading: "加载中",
        readError: "读取失败",
        captureCount: "{{count}} 条记录",
      },
      summary: {
        active: "当前",
        waiting: "等待近期记录",
        noCapturesYet: "还没有记录",
        percentOfRecent: "占近期记录的 {{percent}}%",
        recentLoadingHint: "正在载入近期记录",
        recentErrorHint: "近期记录暂不可用",
        recentWindow: "最近 {{days}} 天",
      },
    },
    filters: {
      all: {
        label: "全部记录",
        shortLabel: "全部",
      },
      text: {
        label: "文本",
        shortLabel: "文本",
      },
      link: {
        label: "链接",
        shortLabel: "链接",
      },
      image: {
        label: "图片",
        shortLabel: "图片",
      },
      video: {
        label: "视频",
        shortLabel: "视频",
      },
      file: {
        label: "文件",
        shortLabel: "文件",
      },
    },
    empty: {
      retry: "重试",
      loadingTitle: "正在载入剪贴板记录",
      loadingDescription: "最近的剪贴板记录正在准备中。",
      errorTitle: "无法读取剪贴板记录",
      defaultTitle: "剪贴板还没有记录",
      defaultDescription: "在 macOS 中复制文本、链接或图片后，最近记录会显示在这里。",
      filteredTitle: "没有匹配的记录",
      filteredDescription: "可以清空搜索词，或将类型筛选切回“全部”。",
      imagePreviewUnavailableTitle: "预览不可用",
      imagePreviewUnavailableDescription: "本地预览资源暂时无法在面板中载入。",
      enlargedPreviewUnavailableDescription: "放大预览所需的图片资源暂时无法载入。",
    },
    groups: {
      pinned: "置顶",
      today: "今天",
      yesterday: "昨天",
      loadingOlder: "正在载入更早的记录",
    },
    capture: {
      moreActions: "更多操作",
      thumbnailAlt: {
        image: "图片缩略图",
        video: "视频缩略图",
      },
      sourceUnknown: "来源未知",
      kinds: {
        text: "文本",
        richText: "富文本",
        link: "链接",
        image: "图片",
        video: "视频",
        file: "文件",
      },
      status: {
        archived: "已归档",
        filtered: "已过滤",
      },
      detail: {
        sourceApp: "来源应用",
        contentType: "类型",
        path: "路径",
        availability: "状态",
        characters: "字符数",
        words: "词数",
        dimensions: "尺寸",
        imageSize: "大小",
        url: "链接",
        host: "域名",
        captured: "采集时间",
        bundleId: "Bundle ID",
        unavailableValue: "不可用",
        unavailableShort: "不可用",
        richTextValue: "富文本",
        linesAndChars: "{{lines}} 行 · {{chars}} 字符",
        sourceAppIconAlt: "{{appName}} 图标",
      },
    },
    actions: {
      copyAgain: "重新复制",
      openLink: "打开链接",
      openImageViewer: "打开查看器",
      openInPreview: "在“预览”中打开",
      open: "打开",
      revealFile: "在访达中显示",
      revealAsset: "显示资源位置",
      pinToTop: "置顶",
      unpin: "取消置顶",
      deleteCapture: "删除记录",
      enlarge: "放大查看",
    },
    dialogs: {
      cancel: "取消",
      gotIt: "知道了",
      pinLimit: {
        title: "替换最早置顶的记录？",
        description: "最多只能保留 5 条置顶记录。继续置顶后，将替换“{{oldest}}”。",
        oldestFallback: "最早置顶的一条记录",
        confirm: "替换最早的一条",
        pending: "正在置顶...",
      },
      deleteCapture: {
        title: "删除这条剪贴板记录？",
        description: "删除后，这条记录会从剪贴板历史和本地面板缓存中移除。",
        confirm: "删除记录",
        pending: "正在删除...",
      },
      shortcuts: {
        title: "剪贴板快捷键",
        actionHeader: "操作",
        shortcutHeader: "快捷键",
        rows: {
          openSelectedCapture: "用原生应用打开当前选中项",
          openActions: "打开当前选中项的操作菜单",
          moveBetweenCaptures: "在记录之间移动",
          jumpToEdges: "跳到第一条或最后一条记录",
          pasteBack: "将当前选中项回填到原应用",
          pasteFloating: "在剪贴板小窗中，将当前选中项回填到原应用",
          dismiss: "关闭预览，或收起剪贴板小窗",
        },
      },
    },
    window: {
      pasteToTarget: "回填到 {{appName}}",
      pasteToPreviousApp: "回填到上一个应用",
      shortcutsButtonAria: "打开剪贴板快捷键说明",
      pauseStatusButtonAria: "打开暂停采集状态提示",
      capturePaused: {
        title: "当前已暂停采集",
        description: "Tino 暂时不会继续采集新的剪贴板内容。你可以直接在这里恢复采集。",
        resume: "恢复采集",
        pending: "正在恢复...",
        dismiss: "关闭暂停采集提示",
      },
    },
    toolbar: {
      searchPlaceholder: "搜索记录，也支持 app:/date:/type:",
      clearSearch: "清空搜索",
      filterAria: "按类型筛选记录",
    },
    preview: {
      titles: {
        imageWithDimensions: "图片（{{width}}×{{height}}）",
        imageFallback: "图片记录",
        linkFallback: "链接记录",
        formattedTextFallback: "富文本记录",
        textFallback: "文本记录",
      },
      tabs: {
        markdown: "Markdown",
        richText: "富文本",
        text: "文本",
        html: "HTML",
        rawRich: "原始富文本",
        raw: "原始内容",
      },
      noRawSource: "没有可显示的原始内容。",
      closePreview: "关闭预览",
      linkOpen: "打开链接",
      file: {
        imagePreviewAlt: "图片预览",
        videoPreviewTitle: "视频预览",
        audioFallbackTitle: "音频文件",
        audioHint: "可使用原生播放器控件试听这个音频文件。",
        referenceFallbackTitle: "文件引用",
        missingWarning: "原始文件在记录的路径上已不可用。",
        pdfFrameTitle: "PDF 预览：{{name}}",
        descriptions: {
          missing: "引用还在，但原始文件已无法在该路径找到。",
          failed: "预览加载失败。你仍然可以直接打开文件，或在访达中定位它。",
          image: "这是从剪贴板记录下来的图片文件。",
          video: "这是从剪贴板记录下来的视频文件。",
          audio: "这是从剪贴板记录下来的音频文件。",
          pdf: "这是从剪贴板记录下来的 PDF 文档。",
          presentation: "这是从剪贴板记录下来的演示文稿文件。",
          spreadsheet: "这是从剪贴板记录下来的表格文件。",
          document: "这是从剪贴板记录下来的文档文件。",
          markdown: "这是从剪贴板记录下来的 Markdown 文件。",
          code: "这是从剪贴板记录下来的代码或配置文件。",
          archive: "这是从剪贴板记录下来的{{type}}。",
          unknown: "这是从剪贴板记录下来的文件引用。",
          default: "这是从剪贴板记录下来的文件引用。",
        },
      },
      video: {
        play: "播放视频",
        pause: "暂停视频",
        seek: "拖动视频进度",
        mute: "静音",
        unmute: "取消静音",
      },
    },
    fileTypes: {
      imageFile: "图片文件",
      video: "视频",
      audioFile: "音频文件",
      pdfDocument: "PDF 文档",
      presentation: "演示文稿",
      spreadsheet: "表格文件",
      document: "文档文件",
      markdown: "Markdown 文件",
      codeFile: "代码文件",
      package: "安装包",
      archive: "压缩包",
      unknownFileType: "文件",
    },
    errors: {
      historyLoadFailed: "无法读取剪贴板记录。",
      pasteBackFailed: "未能将剪贴板内容回填到上一个应用。",
      pasteBackFailedWithDetail: "未能将剪贴板内容回填到上一个应用。\n\n详情：{{detail}}",
      dialogTitles: {
        packagedPreviewRequired: "需要使用已打包的预览版应用",
        localSigningRequired: "需要完成本地签名",
        reinstallPreviewApp: "请重新安装预览版应用",
        clipboardReturnFailed: "回填失败",
      },
      dialogBodies: {
        packagedPreviewRequired: "回填功能需要使用已打包的预览版应用，不能直接使用原始开发构建。",
        localSigningRequired: "回填功能依赖本地签名的预览版应用。请先运行 `pnpm macos:setup-local-signing`，再重新构建并安装预览版应用。",
        reinstallPreviewApp: "当前安装的预览版应用签名与这次构建不一致。请重新构建并安装最新的预览版应用后再试。",
      },
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
      openPathInDefaultApp: {
        label: "用默认应用打开",
        errorTitle: "无法打开文件",
        errorBody: [
          "Tino 无法使用系统默认应用打开该文件。",
          "",
          "路径：{{path}}",
          "原因：{{reason}}",
          "",
          "请改用 Reveal 来定位原始文件。",
        ].join("\n"),
        errorReasonFallback: "未知错误",
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
        description: "立即切换界面语言。",
        label: "语言",
      },
      mode: {
        description: "浅色、深色，或跟随系统。",
        label: "外观模式",
        options: {
          dark: "深色",
          light: "浅色",
          system: "系统",
        },
      },
      palette: {
        active: "当前使用",
        description: "应用配色方案。",
        label: "色板",
        options: {
          ocean: "海洋",
          tino: "Tino",
        },
      },
    },
    archive: {
      root: {
        info: "Tino 会将 `daily` 归档和后续 AI 输出写入这个目录。",
        label: "归档目录",
        pick: "选择目录",
        placeholder: "~/tino-inbox",
        reveal: "显示位置",
      },
    },
    app: {
      launchAtLogin: {
        disabled: "关闭",
        enabled: "开启",
        info: "控制登录后是否自动启动 Tino。",
        label: "开机启动",
        toggle: "切换状态",
        updating: "更新中",
      },
      logs: {
        info: "打开运行日志目录，便于排查问题。",
        label: "日志",
        open: "打开日志",
      },
      shortcuts: {
        label: "快捷键",
        summary: "全局与应用内快捷键",
      },
    },
    badges: {
      appliesInstantly: "即时生效",
      configured: "已配置",
      experimental: "开发中",
      needsAttention: "待配置",
      paused: "已暂停",
      running: "运行中",
    },
    clipboard: {
      capture: {
        pause: "暂停采集",
        resume: "恢复采集",
        confirmPause: {
          title: "暂停剪贴板采集？",
          description: "暂停后，新的剪贴板内容将不会继续采集。你可以稍后在设置页或剪贴板页面直接恢复。",
          cancel: "取消",
          confirm: "暂停采集",
          pending: "正在暂停...",
        },
      },
      keywords: {
        info: "用分号分隔关键词。命中后不会采集",
        label: "忽略关键词",
        placeholder: "密码；验证码；仅限内部",
      },
      retention: {
        info: "控制剪贴板历史的可见窗口。缩短时长只会暂时隐藏更早的缓存，重新调大后仍可恢复；超过 90 天的缓存会自动清理，不会影响 `daily` 等长期保存的 Markdown 文件。",
        label: "历史保留时长",
        options: {
          ninetyDays: {
            label: "90 天",
            tone: "最长",
          },
          oneDay: {
            label: "1 天",
            tone: "最省空间",
          },
          sevenDays: {
            label: "7 天",
            tone: "较宽松",
          },
          threeDays: {
            label: "3 天",
            tone: "均衡",
          },
        },
      },
      sourceApps: {
        empty: "尚未设置忽略应用。",
        info: "可直接搜索本机应用，被忽略的应用不会采集",
        label: "忽略应用",
        loadError: "加载应用列表失败。",
        loading: "正在加载应用列表…",
        noMatch: "没有匹配的应用。",
        remove: "将 {{appName}} 从忽略应用中移除",
        searchPlaceholder: "搜索应用名称",
      },
    },
    navigation: {
      sectionsAriaLabel: "设置导航",
    },
    provider: {
      advanced: {
        label: "高级设置",
        summary: "接口地址、模型、连通性测试",
      },
      apiKey: {
        description: "仅保存在本地，并跟随这条服务配置。",
        hint: "粘贴这个账号对应的 API 密钥。",
        label: "API 密钥",
        maskedValue: "当前密钥：{{key}}",
        placeholder: "粘贴这个服务的 API 密钥",
        privateBadge: "私密",
      },
      current: {
        description: "后台 AI 和 /ai 实时复核默认使用这条配置。",
        label: "默认服务",
        missing: "尚未设置默认服务",
      },
      baseUrl: {
        description: "默认使用厂商接口地址，也支持填写兼容中转。",
        hint: "只有在使用中转或兼容接口时才需要修改。",
        label: "接口地址",
      },
      delete: {
        cancel: "取消",
        confirm: "删除",
        description: "确定删除已保存的配置“{{name}}”（{{vendor}}）吗？",
        title: "删除配置",
      },
      list: {
        add: "新增配置",
        currentActive: "默认项",
        delete: "删除配置",
        description: "保存多个账号或中转配置，并指定后台 AI 默认使用哪一个。",
        edit: "编辑",
        editing: "正在编辑",
        keepOneHint: "至少保留一条服务配置；如果暂时不启用 AI，可以将字段留空。",
        label: "已保存的服务配置",
        useNow: "设为默认",
      },
      model: {
        defaultOptionHint: "不单独指定时，沿用 {{model}}。",
        defaultOptionLabel: "跟随厂商默认",
        description: "设置这条服务配置默认使用的模型。",
        hint: "默认会使用 {{model}}；首页临时切换不会回写这里。",
        label: "默认模型",
        options: {
          deepseekChat: {
            description: "适合通用任务的默认 DeepSeek 模型。",
          },
          deepseekReasoner: {
            description: "偏推理场景的 DeepSeek 模型。",
          },
          gpt54: {
            description: "能力更强的 GPT 模型。",
          },
          gpt54Mini: {
            description: "速度更快的 GPT-5.4 变体。",
          },
        },
        placeholder: "默认：{{model}}",
      },
      name: {
        description: "会显示在首页模型选择器的服务分组中。",
        generatedLabel: "配置",
        hint: "给这条配置起一个简短名称。",
        label: "配置名称",
        placeholder: "默认 OpenAI",
      },
      vendor: {
        description: "选择这条配置对应的服务厂商。",
        hint: "先选厂商；接口地址和默认模型按需填写。",
        label: "厂商",
        options: {
          deepseek: {
            description: "DeepSeek 官方接口，或兼容 DeepSeek 的中转服务。",
          },
          openai: {
            description: "OpenAI 官方接口，或兼容 OpenAI 的中转服务。",
          },
        },
        placeholder: "选择厂商",
      },
      status: {
        apiKeyNeeded: "缺少 API 密钥",
        incomplete: "配置未完成",
        ready: "已就绪",
      },
      test: {
        description: "对当前配置做一次轻量连通性检查。",
        disabledBody: "请先填写接口地址和 API 密钥。",
        errors: {
          apiKeyRequired: "开始测试前需要先填写 API 密钥。",
          baseUrlRequired: "开始测试前需要先填写接口地址。",
          fetchUnavailable: "当前运行环境暂时无法发出服务请求。",
          incompleteResponse: "服务端过早结束，未返回完整响应。",
          modelUnavailable: "当前 {{host}} 暂不提供模型“{{model}}”，请尝试更换模型或配置。",
          nonJsonResponse: "服务端返回的不是 JSON，无法按 OpenAI 兼容接口解析。",
          nonJsonResponseWithV1Hint:
            "服务端返回的不是 JSON；如果这是中转服务，请尝试将接口地址补成以 /v1 结尾。",
          requestBlocked:
            "请求在拿到响应前就被拦截了；在 webview 或浏览器模式下，这通常是 CORS 或中转预检问题。",
          timeout: "响应在完整返回前已超时，请检查网络或更换接口地址。",
        },
        idleBody: "会对当前配置做一次简单的连通性检查。",
        label: "连通性测试",
        pendingBody: "正在测试连接…",
        run: "开始测试",
        running: "测试中…",
        successBody: "连接正常。",
        inactiveHint: "这次测试只会命中 {{editing}}；如果也希望后台 AI 和 /ai 改用它，而不是 {{active}}，请点上面的“设为默认”。",
        unknownError: "服务端返回了未知错误。",
      },
      validation: {
        apiKeyTooShort: "API 密钥看起来过短，请再检查一次。",
        apiKeyWhitespace: "API 密钥不能包含空格或换行。",
        baseUrlCredentialsNotAllowed: "接口地址中不要包含用户名或密码。",
        baseUrlHttpsOnly: "接口地址必须以 https:// 开头。",
        baseUrlInvalid: "请输入有效的 URL。",
        modelWhitespace: "模型 ID 不能包含空格或换行。",
        nameRequired: "请输入配置名称。",
        vendorUnsupported: "请选择支持的厂商。",
      },
    },
    shortcuts: {
      actions: {
        disable: "停用快捷键",
        record: "录入快捷键",
        restoreDefault: "恢复默认",
        stopRecording: "停止录入",
      },
      badges: {
        custom: "已自定义",
        off: "已关闭",
        readOnly: "只读",
        recording: "录入中",
      },
      groups: {
        global: {
          label: "系统级",
          note: "在系统范围内生效，修改后立即保存。",
        },
        local: {
          label: "应用内",
          note: "仅作参考，当前不可修改。",
        },
      },
      messages: {
        cancelled: "已取消录入。",
        cancelledOnBlur: "窗口失去焦点，已取消录入。",
        conflict: "已与 {{labels}} 冲突。请更换快捷键，或先恢复对方的默认值。",
        listening: "等待录入下一组快捷键。按 `Esc` 取消。",
        modifierOnly: "修饰键不能单独作为快捷键。请继续按住，再配合一个主键。",
      },
    },
    sections: {
      ai: {
        description: "为实时复核和后续后台 AI 预留服务接入配置。",
        eyebrow: "处理",
        label: "AI",
        title: "AI",
      },
      app: {
        description: "管理应用偏好、开机启动、日志和快捷键。",
        eyebrow: "应用",
        label: "应用",
        title: "应用",
      },
      archive: {
        description: "决定 Tino 将归档与后续输出写入的位置。",
        eyebrow: "输出",
        label: "归档",
        title: "归档",
      },
      clipboard: {
        description: "管理采集状态、历史保留时长和忽略规则。",
        eyebrow: "输入",
        label: "剪贴板",
        title: "剪贴板",
      },
    },
  },
} satisfies TranslationSchema;

export const localeResources: Record<AppLocale, TranslationSchema> = {
  "en-US": enUSResources,
  "zh-CN": zhCNResources,
};
