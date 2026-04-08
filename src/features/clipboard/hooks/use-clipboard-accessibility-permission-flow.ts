import { useEffect, useEffectEvent, useRef } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  promptForAccessibilityRestart,
  showAccessibilityWarmupDialog,
} from "@/features/clipboard/lib/accessibility-permission-flow";
import { useClipboardAccessibilityStore } from "@/features/clipboard/stores/clipboard-accessibility-store";
import { appEnv } from "@/lib/runtime-profile";
import {
  getAccessibilityPermissionStatus,
  isTauriRuntime,
  openAccessibilitySettings,
} from "@/lib/tauri";

const ACCESSIBILITY_PERMISSION_POLL_INTERVAL_MS = 1500;
const ACCESSIBILITY_PERMISSION_WARMUP_DELAY_MS = 600;

export function useClipboardAccessibilityPermissionFlow() {
  const phase = useClipboardAccessibilityStore((state) => state.phase);
  const warmupRequestedRef = useRef(false);

  const warmupAccessibilityPermission = useEffectEvent(async () => {
    if (warmupRequestedRef.current || !isTauriRuntime() || appEnv === "development") {
      return;
    }

    const currentWindow = getCurrentWindow();
    if (currentWindow.label !== "main" || document.visibilityState !== "visible") {
      return;
    }

    if (useClipboardAccessibilityStore.getState().phase !== "idle") {
      return;
    }

    try {
      const granted = await getAccessibilityPermissionStatus();
      if (granted) {
        return;
      }
    } catch {
      return;
    }

    warmupRequestedRef.current = true;
    useClipboardAccessibilityStore.getState().beginPermissionGrantFlow("startup-warmup");

    await showAccessibilityWarmupDialog();

    try {
      await openAccessibilitySettings();
    } catch {
      // Keep the flow active so a later retry can still detect the permission change.
    }
  });

  const checkAccessibilityPermission = useEffectEvent(async () => {
    if (useClipboardAccessibilityStore.getState().phase !== "awaitingGrant") {
      return;
    }

    try {
      const granted = await getAccessibilityPermissionStatus();
      if (granted) {
        useClipboardAccessibilityStore.getState().markRestartRequired();
      }
    } catch {
      // Ignore transient permission-check failures and retry on the next poll or focus change.
    }
  });

  const promptForRestart = useEffectEvent(async () => {
    await promptForAccessibilityRestart();
  });

  useEffect(() => {
    if (!isTauriRuntime() || appEnv === "development" || getCurrentWindow().label !== "main") {
      return;
    }

    let unlistenWindowFocus = () => {};

    const handleWindowFocus = () => {
      void warmupAccessibilityPermission();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void warmupAccessibilityPermission();
      }
    };

    const timeoutId = window.setTimeout(() => {
      void warmupAccessibilityPermission();
    }, ACCESSIBILITY_PERMISSION_WARMUP_DELAY_MS);

    window.addEventListener("focus", handleWindowFocus, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void warmupAccessibilityPermission();
      }
    }).then((dispose) => {
      unlistenWindowFocus = dispose;
    });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", handleWindowFocus, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unlistenWindowFocus();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime() || phase !== "awaitingGrant") {
      return;
    }

    let unlistenWindowFocus = () => {};

    const handleWindowFocus = () => {
      void checkAccessibilityPermission();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkAccessibilityPermission();
      }
    };

    const intervalId = window.setInterval(() => {
      void checkAccessibilityPermission();
    }, ACCESSIBILITY_PERMISSION_POLL_INTERVAL_MS);

    window.addEventListener("focus", handleWindowFocus, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void checkAccessibilityPermission();
      }
    }).then((dispose) => {
      unlistenWindowFocus = dispose;
    });

    void checkAccessibilityPermission();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unlistenWindowFocus();
    };
  }, [phase]);

  useEffect(() => {
    if (!isTauriRuntime() || phase !== "restartRequired") {
      return;
    }

    void promptForRestart();
  }, [phase]);
}
