import { useEffect, useEffectEvent } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { promptForAccessibilityRestart } from "@/features/clipboard/lib/accessibility-permission-flow";
import { useClipboardAccessibilityStore } from "@/features/clipboard/stores/clipboard-accessibility-store";
import {
  getAccessibilityPermissionStatus,
  isTauriRuntime,
} from "@/lib/tauri";

const ACCESSIBILITY_PERMISSION_POLL_INTERVAL_MS = 1500;

export function useClipboardAccessibilityPermissionFlow() {
  const phase = useClipboardAccessibilityStore((state) => state.phase);

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
