import { useEffect, useEffectEvent } from "react"

import pDebounce from "p-debounce"

import { createRendererLogger } from "@/lib/logger"
import type { SettingsDraft } from "@/types/shell"

const logger = createRendererLogger("settings.persistence")

type UsePendingSettingsPersistenceOptions = {
  getCurrentDraft: () => SettingsDraft
  hasPendingChanges: boolean
  isSavingSettings: boolean
  persistedSettings: SettingsDraft | null
  saveSettingsDraft: (draft: SettingsDraft) => Promise<void>
  settingsDraft: SettingsDraft
}

export function usePendingSettingsPersistence({
  getCurrentDraft,
  hasPendingChanges,
  isSavingSettings,
  persistedSettings,
  saveSettingsDraft,
  settingsDraft,
}: UsePendingSettingsPersistenceOptions) {
  const persistPendingDraft = useEffectEvent(async (draft: SettingsDraft) => {
    await saveSettingsDraft(draft)
  })

  const schedulePendingSettingsFlush = useEffectEvent(() => {
    if (!hasPendingChanges || isSavingSettings) {
      return
    }

    void persistPendingDraft(getCurrentDraft()).catch((error) => {
      logger.error("Failed to persist pending settings", error)
    })
  })

  const flushPendingSettingsOnUnmount = useEffectEvent(() => {
    if (!hasPendingChanges) {
      return
    }

    void saveSettingsDraft(getCurrentDraft()).catch((error) => {
      logger.error("Failed to persist pending settings during unmount", error)
    })
  })

  useEffect(() => {
    if (!persistedSettings || !hasPendingChanges || isSavingSettings) {
      return
    }

    const abortController = new AbortController()
    const debouncedFlush = pDebounce(
      async () => schedulePendingSettingsFlush(),
      700,
      { signal: abortController.signal },
    )

    void debouncedFlush().catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      logger.error("Failed to debounce pending settings persistence", error)
    })

    return () => {
      abortController.abort()
    }
  }, [hasPendingChanges, isSavingSettings, persistedSettings, settingsDraft])

  useEffect(() => {
    return () => {
      flushPendingSettingsOnUnmount()
    }
  }, [])
}
