import { useEffect, useEffectEvent } from "react"

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
  const schedulePendingSettingsFlush = useEffectEvent(() => {
    if (!hasPendingChanges || isSavingSettings) {
      return
    }

    void saveSettingsDraft(getCurrentDraft()).catch((error) => {
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

    const timeout = window.setTimeout(() => {
      schedulePendingSettingsFlush()
    }, 700)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [hasPendingChanges, isSavingSettings, persistedSettings, settingsDraft])

  useEffect(() => {
    return () => {
      flushPendingSettingsOnUnmount()
    }
  }, [])
}
