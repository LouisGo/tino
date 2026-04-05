import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { CSSProperties } from "react";

import { filterConfigurableShortcutOverrides } from "@/app/shortcuts";
import { syncLocalePreference } from "@/i18n";
import {
  getLogDirectory,
  pickDirectory,
  revealPath,
} from "@/lib/tauri";
import { AiSettingsSection } from "@/features/settings/components/ai-settings-section";
import { AppearanceSettingsSection } from "@/features/settings/components/appearance-settings-section";
import { AutomationSettingsSection } from "@/features/settings/components/automation-settings-section";
import { ShortcutSettingsSection } from "@/features/settings/components/shortcut-settings-section";
import { SettingsStickyTabs } from "@/features/settings/components/settings-sticky-tabs";
import { WorkspaceSettingsSection } from "@/features/settings/components/workspace-settings-section";
import { useSettingsController } from "@/features/settings/hooks/use-settings-controller";
import { useSettingsScrollSpy } from "@/features/settings/hooks/use-settings-scroll-spy";
import {
  settingsSectionIds,
  settingsSections,
} from "@/features/settings/settings-sections";

const SECTION_GAP_OFFSET = 24;

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
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const stickyShellRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [contentInsetTop, setContentInsetTop] = useState(10);
  const [scrollOffset, setScrollOffset] = useState(120);
  const { activeSectionId, scrollToSection } = useSettingsScrollSpy(settingsSectionIds, {
    scrollViewport,
    scrollOffset,
  });
  const flushPendingSettings = useEffectEvent(() => {
    if (!hasPendingChanges || isSavingSettings) {
      return;
    }

    void saveSettingsDraft(settingsDraftRef.current).catch((error) => {
      console.error("[settings] failed to persist pending changes", error);
    });
  });

  useEffect(() => {
    if (typeof window === "undefined" || !stickyShellRef.current || !tabsRef.current) {
      return;
    }

    const stickyShell = stickyShellRef.current;
    const tabs = tabsRef.current;
    const updateOffset = () => {
      setContentInsetTop(
        Math.max(0, stickyShell.offsetHeight - tabs.offsetHeight + 4),
      );
      setScrollOffset(tabs.offsetHeight + SECTION_GAP_OFFSET - 4);
    };

    updateOffset();

    const observer = new ResizeObserver(updateOffset);
    observer.observe(stickyShell);
    observer.observe(tabs);
    window.addEventListener("resize", updateOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, []);

  useEffect(() => {
    if (!persistedSettings || !hasPendingChanges || isSavingSettings) {
      return;
    }

    const timeout = window.setTimeout(() => {
      flushPendingSettings();
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    hasPendingChanges,
    isSavingSettings,
    persistedSettings,
    settingsDraft,
  ]);

  useEffect(() => {
    return () => {
      flushPendingSettings();
    };
  }, []);

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
            onPickKnowledgeRoot={async () => {
              const value = await pickDirectory(settingsDraft.knowledgeRoot);
              if (!value) {
                return;
              }

              patchSettingsDraft({ knowledgeRoot: value });
            }}
            onRevealKnowledgeRoot={async () => {
              if (!settingsDraft.knowledgeRoot) {
                return;
              }

              await revealPath(settingsDraft.knowledgeRoot);
            }}
          />

          <AiSettingsSection
            settingsDraft={settingsDraft}
            patchSettingsDraft={patchSettingsDraft}
          />

          <AppearanceSettingsSection
            localePreference={settingsDraft.localePreference}
            mode={mode}
            onLocalePreferenceChange={async (localePreference) => {
              const nextDraft = {
                ...settingsDraftRef.current,
                localePreference,
              };

              patchSettingsDraft({ localePreference });
              await syncLocalePreference(localePreference);
              await saveSettingsDraft(nextDraft);
            }}
            themeName={themeName}
            setMode={setMode}
            setThemeName={setThemeName}
          />

          <AutomationSettingsSection
            autostartEnabled={autostartEnabled}
            captureEnabled={captureEnabled}
            toggleAutostartPending={toggleAutostartMutation.isPending}
            onToggleCapture={() => setCaptureEnabled(!captureEnabled)}
            onToggleAutostart={async () => {
              await toggleAutostartMutation.mutateAsync(!autostartEnabled);
            }}
            onOpenLogs={async () => {
              const path = await getLogDirectory();
              await revealPath(path);
            }}
          />

          <ShortcutSettingsSection
            overrides={settingsDraft.shortcutOverrides}
            onChange={(nextOverrides) => {
              const shortcutOverrides =
                filterConfigurableShortcutOverrides(nextOverrides);
              const nextDraft = {
                ...settingsDraftRef.current,
                shortcutOverrides,
              };

              patchSettingsDraft({
                shortcutOverrides,
              });

              void saveSettingsDraft(nextDraft).catch((error) => {
                console.error("[settings] failed to persist shortcut overrides", error);
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
