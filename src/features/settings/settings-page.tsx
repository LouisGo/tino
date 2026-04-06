import type { CSSProperties } from "react";

import { AiSettingsSection } from "@/features/settings/components/ai-settings-section";
import { AppearanceSettingsSection } from "@/features/settings/components/appearance-settings-section";
import { AutomationSettingsSection } from "@/features/settings/components/automation-settings-section";
import { ShortcutSettingsSection } from "@/features/settings/components/shortcut-settings-section";
import { SettingsStickyTabs } from "@/features/settings/components/settings-sticky-tabs";
import { WorkspaceSettingsSection } from "@/features/settings/components/workspace-settings-section";
import { useSettingsController } from "@/features/settings/hooks/use-settings-controller";
import { useRuntimeProviderForm } from "@/features/settings/hooks/use-runtime-provider-form";
import { useSettingsLayout } from "@/features/settings/hooks/use-settings-layout";
import { usePendingSettingsPersistence } from "@/features/settings/hooks/use-pending-settings-persistence";
import { useSettingsSectionActions } from "@/features/settings/hooks/use-settings-section-actions";
import { useSettingsScrollSpy } from "@/features/settings/hooks/use-settings-scroll-spy";
import {
  settingsSectionIds,
  settingsSections,
} from "@/features/settings/settings-sections";

export function SettingsPage() {
  const {
    autostartEnabled,
    captureEnabled,
    hasPendingChanges,
    isSavingSettings,
    mode,
    patchSettingsDraft,
    persistedSettings,
    saveSettingsDraft,
    setCaptureEnabled,
    setMode,
    setThemeName,
    settingsDraft,
    settingsDraftRef,
    themeName,
    toggleAutostartMutation,
  } = useSettingsController();
  const {
    contentInsetTop,
    scrollOffset,
    scrollViewport,
    setScrollViewport,
    stickyShellRef,
    tabsRef,
  } = useSettingsLayout();
  const runtimeProviderForm = useRuntimeProviderForm({
    patchSettingsDraft,
    settingsDraft,
  });
  const { activeSectionId, scrollToSection } = useSettingsScrollSpy(settingsSectionIds, {
    scrollViewport,
    scrollOffset,
  });
  usePendingSettingsPersistence({
    getCurrentDraft: () => settingsDraftRef.current,
    hasPendingChanges,
    isSavingSettings,
    persistedSettings,
    saveSettingsDraft,
    settingsDraft,
  });
  const {
    handleLocalePreferenceChange,
    handleOpenLogs,
    handlePickKnowledgeRoot,
    handleRevealKnowledgeRoot,
    handleShortcutOverridesChange,
    handleToggleAutostart,
    handleToggleCapture,
  } = useSettingsSectionActions({
    autostartEnabled,
    captureEnabled,
    getCurrentDraft: () => settingsDraftRef.current,
    patchSettingsDraft,
    saveSettingsDraft,
    setCaptureEnabled,
    settingsDraft,
    toggleAutostart: (enabled) => toggleAutostartMutation.mutateAsync(enabled),
  });

  return (
    <div
      className="relative mx-auto h-full max-w-[1120px] min-h-0 overflow-hidden"
      style={{ "--settings-nav-offset": `${scrollOffset}px` } as CSSProperties}
    >
      <div
        ref={setScrollViewport}
        className="app-scroll-area relative h-full overflow-y-auto pr-2"
      >
        <div
          ref={stickyShellRef}
          className="sticky top-0 z-20 pb-4"
        >
          <div className="relative">
            <SettingsStickyTabs
              ref={tabsRef}
              activeSectionId={activeSectionId}
              onSelectSection={scrollToSection}
              sections={settingsSections}
            />
          </div>
        </div>

        <div
          className="space-y-10 pb-8"
          style={{ paddingTop: `${contentInsetTop}px` }}
        >
          <WorkspaceSettingsSection
            settingsDraft={settingsDraft}
            patchSettingsDraft={patchSettingsDraft}
            onPickKnowledgeRoot={handlePickKnowledgeRoot}
            onRevealKnowledgeRoot={handleRevealKnowledgeRoot}
          />

          <AiSettingsSection
            runtimeProviderForm={runtimeProviderForm}
            settingsDraft={settingsDraft}
          />

          <AppearanceSettingsSection
            localePreference={settingsDraft.localePreference}
            mode={mode}
            onLocalePreferenceChange={handleLocalePreferenceChange}
            themeName={themeName}
            setMode={setMode}
            setThemeName={setThemeName}
          />

          <AutomationSettingsSection
            autostartEnabled={autostartEnabled}
            captureEnabled={captureEnabled}
            toggleAutostartPending={toggleAutostartMutation.isPending}
            onToggleCapture={handleToggleCapture}
            onToggleAutostart={handleToggleAutostart}
            onOpenLogs={handleOpenLogs}
          />

          <ShortcutSettingsSection
            overrides={settingsDraft.shortcutOverrides}
            onChange={handleShortcutOverridesChange}
          />
        </div>
      </div>
    </div>
  );
}
