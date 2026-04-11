import { useCallback } from "react";

import { resetClipboardCapturePauseGuideDismissed } from "@/features/clipboard/lib/clipboard-capture-pause-guide";
import { usePersistAppSettingsMutation } from "@/hooks/use-persist-app-settings-mutation";
import { createRendererLogger } from "@/lib/logger";

const logger = createRendererLogger("clipboard.capture-control");

export function useClipboardCaptureControl() {
  const mutation = usePersistAppSettingsMutation({
    onError: (error) => {
      logger.error("Failed to persist clipboard capture state", error);
    },
    onSuccess: async ({ saved }) => {
      if (saved.clipboardCaptureEnabled) {
        resetClipboardCapturePauseGuideDismissed();
      }
    },
  });
  const setClipboardCaptureEnabled = useCallback(
    async (enabled: boolean) => {
      await mutation.mutateAsync((previousSettings) => ({
        ...previousSettings,
        clipboardCaptureEnabled: enabled,
      }));
    },
    [mutation],
  );

  return {
    isPending: mutation.isPending,
    setClipboardCaptureEnabled,
  };
}
