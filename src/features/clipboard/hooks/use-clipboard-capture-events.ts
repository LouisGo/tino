import { useEffect, useEffectEvent } from "react";

import { listen } from "@tauri-apps/api/event";

import {
  clipboardCapturesUpdatedEvent,
  isTauriRuntime,
} from "@/lib/tauri";

export function useClipboardCaptureEvents(onUpdate: () => void | Promise<void>) {
  const handleUpdate = useEffectEvent(onUpdate);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: null | (() => void | Promise<void>) = null;

    void listen(clipboardCapturesUpdatedEvent, () => {
      void handleUpdate();
    }).then((cleanup) => {
      if (disposed) {
        void cleanup();
        return;
      }

      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      if (unlisten) {
        void unlisten();
      }
    };
  }, []);
}
