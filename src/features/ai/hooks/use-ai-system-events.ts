import { useEffect, useEffectEvent } from "react";

import { aiSystemUpdatedEvent, isTauriRuntime } from "@/lib/tauri";
import type { AiSystemUpdatedPayload } from "@/types/shell";

export function useAiSystemEvents(
  onUpdate: (payload: AiSystemUpdatedPayload) => void | Promise<void>,
) {
  const handleUpdate = useEffectEvent(onUpdate);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: null | (() => void | Promise<void>) = null;

    void aiSystemUpdatedEvent.listen(({ payload }) => {
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
