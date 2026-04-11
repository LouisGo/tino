import { useCallback } from "react"

import { filterConfigurableShortcutOverrides } from "@/app/shortcuts"
import { syncLocalePreference } from "@/i18n"
import { createRendererLogger } from "@/lib/logger"
import {
  getLogDirectory,
  pickDirectory,
  revealPath,
} from "@/lib/tauri"
import type { AppLocalePreference, SettingsDraft, ShortcutOverrideRecord } from "@/types/shell"

const logger = createRendererLogger("settings.actions")

type UseSettingsSectionActionsOptions = {
  autostartEnabled: boolean
  getCurrentDraft: () => SettingsDraft
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void
  saveSettingsDraft: (draft: SettingsDraft) => Promise<void>
  settingsDraft: SettingsDraft
  toggleAutostart: (enabled: boolean) => Promise<unknown>
}

export function useSettingsSectionActions({
  autostartEnabled,
  getCurrentDraft,
  patchSettingsDraft,
  saveSettingsDraft,
  settingsDraft,
  toggleAutostart,
}: UseSettingsSectionActionsOptions) {
  const handlePickKnowledgeRoot = useCallback(async () => {
    const value = await pickDirectory(settingsDraft.knowledgeRoot)
    if (!value) {
      return
    }

    patchSettingsDraft({ knowledgeRoot: value })
  }, [patchSettingsDraft, settingsDraft.knowledgeRoot])

  const handleRevealKnowledgeRoot = useCallback(async () => {
    if (!settingsDraft.knowledgeRoot) {
      return
    }

    await revealPath(settingsDraft.knowledgeRoot)
  }, [settingsDraft.knowledgeRoot])

  const handleLocalePreferenceChange = useCallback(
    async (localePreference: AppLocalePreference) => {
      const previousLocalePreference = getCurrentDraft().localePreference
      const nextDraft = {
        ...getCurrentDraft(),
        localePreference,
      }

      patchSettingsDraft({ localePreference })
      await syncLocalePreference(localePreference, { persist: false })

      try {
        await saveSettingsDraft(nextDraft)
      } catch (error) {
        patchSettingsDraft({ localePreference: previousLocalePreference })
        await syncLocalePreference(previousLocalePreference, { persist: false })
        throw error
      }
    },
    [getCurrentDraft, patchSettingsDraft, saveSettingsDraft],
  )

  const handleToggleAutostart = useCallback(async () => {
    await toggleAutostart(!autostartEnabled)
  }, [autostartEnabled, toggleAutostart])

  const handleOpenLogs = useCallback(async () => {
    const path = await getLogDirectory()
    await revealPath(path)
  }, [])

  const handleShortcutOverridesChange = useCallback(
    (nextOverrides: ShortcutOverrideRecord) => {
      const shortcutOverrides = filterConfigurableShortcutOverrides(nextOverrides)
      const nextDraft = {
        ...getCurrentDraft(),
        shortcutOverrides,
      }

      patchSettingsDraft({
        shortcutOverrides,
      })

      void saveSettingsDraft(nextDraft).catch((error) => {
        logger.error("Failed to persist shortcut overrides", error)
      })
    },
    [getCurrentDraft, patchSettingsDraft, saveSettingsDraft],
  )

  return {
    handleLocalePreferenceChange,
    handleOpenLogs,
    handlePickKnowledgeRoot,
    handleRevealKnowledgeRoot,
    handleShortcutOverridesChange,
    handleToggleAutostart,
  }
}
