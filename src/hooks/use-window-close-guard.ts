import { useEffect } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauriRuntime } from "@/lib/tauri";

export function useWindowCloseGuard() {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await getCurrentWindow().hide();
      })
      .then((dispose) => {
        unlisten = dispose;
      });

    return () => {
      unlisten?.();
    };
  }, []);
}
