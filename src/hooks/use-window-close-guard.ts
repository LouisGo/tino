import { useEffect } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { createRendererLogger } from "@/lib/logger";
import { isTauriRuntime } from "@/lib/tauri";

export function useWindowCloseGuard() {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | undefined;
    const currentWindow = getCurrentWindow();
    const logger = createRendererLogger("window-close");

    void currentWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await currentWindow.hide();
        } catch (error) {
          logger.error("Failed to hide window on close request", error);
        }
      })
      .then((dispose) => {
        unlisten = dispose;
      });

    return () => {
      unlisten?.();
    };
  }, []);
}
