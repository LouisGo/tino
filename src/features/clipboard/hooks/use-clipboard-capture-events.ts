import { useEffect, useEffectEvent } from "react";

import {
  clipboardCapturesUpdatedEvent,
  isTauriRuntime,
} from "@/lib/tauri";
import type { ClipboardCapturesUpdatedPayload } from "@/types/shell";

export function useClipboardCaptureEvents(
  onUpdate: (payload: ClipboardCapturesUpdatedPayload) => void | Promise<void>,
) {
  const handleUpdate = useEffectEvent(onUpdate);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: null | (() => void | Promise<void>) = null;

    void clipboardCapturesUpdatedEvent.listen(({ payload }) => {
      void handleUpdate(payload);
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
