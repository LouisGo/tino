import type { CSSProperties } from "react";

import { useEffect, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

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
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
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
    scrollOffset,
    scrollViewport,
    setScrollViewport,
  } = useSettingsLayout();
  const runtimeProviderForm = useRuntimeProviderForm({
    patchSettingsDraft,
    settingsDraft,
  });
  const { activeSectionId, scrollToSection } = useSettingsScrollSpy(settingsSectionIds, {
    scrollViewport,
    scrollOffset,
  });
  const hashSectionId = useMemo(() => {
    const normalizedHash = hash.replace(/^#/, "");
    return settingsSectionIds.find((sectionId) => sectionId === normalizedHash) ?? null;
  }, [hash]);

  useEffect(() => {
    if (!hashSectionId || !scrollViewport) {
      return;
    }

    scrollToSection(hashSectionId, { behavior: "auto" });
  }, [hashSectionId, scrollToSection, scrollViewport]);
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
  const handleSelectSection = (sectionId: (typeof settingsSectionIds)[number]) => {
    scrollToSection(sectionId);

    if (hashSectionId === sectionId) {
      return;
    }

    void navigate({
      to: "/settings",
      hash: sectionId,
      replace: true,
    });
  };

  return (
    <div
      className="app-page-shell relative flex h-full w-full min-h-0 flex-col overflow-hidden"
      style={{ "--settings-nav-offset": `${scrollOffset}px` } as CSSProperties}
    >
      <div className="app-page-rail flex min-h-0 flex-1 flex-col [--app-page-rail-base:46rem] [--app-page-rail-growth:18vw]">
        <div
          className="relative z-20 shrink-0 pb-1"
        >
          <div className="relative">
            <SettingsStickyTabs
              activeSectionId={activeSectionId}
              onSelectSection={handleSelectSection}
              sections={settingsSections}
            />
          </div>
        </div>

        <div
          ref={setScrollViewport}
          className="app-scroll-area min-h-0 flex-1 overflow-y-auto pr-1 pt-3 sm:pr-2"
        >
          <div className="space-y-10 pb-8">
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
    </div>
  );
}
