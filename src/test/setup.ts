import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useClipboardAccessibilityStore } from "@/features/clipboard/stores/clipboard-accessibility-store";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { useSettingsDraftStore } from "@/features/settings/stores/settings-draft-store";
import {
  bootstrapI18n,
  defaultAppLocalePreference,
  syncLocalePreference,
} from "@/i18n";
import { DEFAULT_CLIPBOARD_HISTORY_DAYS } from "@/lib/app-defaults";
import { getInitialThemePreference } from "@/lib/theme";
import { useLocaleStore } from "@/stores/locale-store";
import { useThemeStore } from "@/stores/theme-store";
import {
  clearMocks,
  installBaseTauriMocks,
} from "@/test/tauri";

class ResizeObserverStub {
  disconnect() {}

  observe() {}

  unobserve() {}
}

function installDomStubs() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, "requestIdleCallback", {
    configurable: true,
    writable: true,
    value: vi.fn((callback: IdleRequestCallback) =>
      window.setTimeout(
        () =>
          callback({
            didTimeout: false,
            timeRemaining: () => 50,
          }),
        0,
      )),
  });

  Object.defineProperty(window, "cancelIdleCallback", {
    configurable: true,
    writable: true,
    value: vi.fn((id: number) => {
      window.clearTimeout(id);
    }),
  });

  Object.defineProperty(window, "open", {
    configurable: true,
    writable: true,
    value: vi.fn(() => null),
  });

  Object.defineProperty(window, "alert", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });

  Object.defineProperty(window, "confirm", {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  });

  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn().mockResolvedValue(""),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });

  Object.defineProperty(window.HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:tino-test"),
  });

  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });

  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

function resetAppStores() {
  const initialTheme = getInitialThemePreference();

  useThemeStore.setState({
    mode: initialTheme.mode,
    themeName: initialTheme.themeName,
  });
  useLocaleStore.setState({
    preference: defaultAppLocalePreference(),
  });
  useSettingsDraftStore.setState({
    settingsDraft: {
      knowledgeRoot: "",
      runtimeProviderProfiles: [],
      activeRuntimeProviderId: "",
      localePreference: defaultAppLocalePreference(),
      clipboardHistoryDays: DEFAULT_CLIPBOARD_HISTORY_DAYS,
      clipboardCaptureEnabled: true,
      clipboardExcludedSourceApps: [],
      clipboardExcludedKeywords: [],
      shortcutOverrides: {},
    },
  });
  useClipboardBoardStore.getState().resetState();
  useClipboardAccessibilityStore.setState({
    details: null,
    phase: "idle",
  });
}

function resetDocumentState() {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-window-surface");
  document.documentElement.style.colorScheme = "";
  document.documentElement.style.backgroundColor = "";
  document.body.style.backgroundColor = "";
  document.body.style.backgroundImage = "";
  delete window.__TINO_WINDOW_SURFACE__;
}

installBaseTauriMocks();
installDomStubs();
bootstrapI18n();

beforeEach(async () => {
  installBaseTauriMocks();
  installDomStubs();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetDocumentState();
  resetAppStores();
  await syncLocalePreference(defaultAppLocalePreference(), { persist: false });
});

afterEach(() => {
  cleanup();
  clearMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetDocumentState();
});
