import type { CSSProperties } from "react";

import { useEffect, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { AiSettingsSection } from "@/features/settings/components/ai-settings-section";
import { AppSettingsSection } from "@/features/settings/components/app-settings-section";
import { ArchiveSettingsSection } from "@/features/settings/components/archive-settings-section";
import { ClipboardSettingsSection } from "@/features/settings/components/clipboard-settings-section";
import { SettingsStickyTabs } from "@/features/settings/components/settings-sticky-tabs";
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

    let timeoutId = 0;
    let frameId = 0;

    const runScroll = () => {
      scrollToSection(hashSectionId, { behavior: "auto" });
      timeoutId = window.setTimeout(() => {
        scrollToSection(hashSectionId, { behavior: "auto" });
      }, 180);
    };

    frameId = window.requestAnimationFrame(runScroll);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
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
      hashScrollIntoView: false,
      replace: true,
      resetScroll: false,
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
          <div className="space-y-8 pb-8">
            <ClipboardSettingsSection
              captureEnabled={captureEnabled}
              onToggleCapture={handleToggleCapture}
              settingsDraft={settingsDraft}
              patchSettingsDraft={patchSettingsDraft}
            />

            <ArchiveSettingsSection
              settingsDraft={settingsDraft}
              onPickKnowledgeRoot={handlePickKnowledgeRoot}
              onRevealKnowledgeRoot={handleRevealKnowledgeRoot}
            />

            <AiSettingsSection
              runtimeProviderForm={runtimeProviderForm}
              settingsDraft={settingsDraft}
            />

            <AppSettingsSection
              autostartEnabled={autostartEnabled}
              localePreference={settingsDraft.localePreference}
              mode={mode}
              onLocalePreferenceChange={handleLocalePreferenceChange}
              onOpenLogs={handleOpenLogs}
              onShortcutOverridesChange={handleShortcutOverridesChange}
              onToggleAutostart={handleToggleAutostart}
              overrides={settingsDraft.shortcutOverrides}
              setMode={setMode}
              setThemeName={setThemeName}
              themeName={themeName}
              toggleAutostartPending={toggleAutostartMutation.isPending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
