import { useCallback, useEffect, useMemo, useState } from "react";

import { Pause, RotateCcw, Slash, SquarePen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutManager } from "@/core/shortcuts";
import { tx, useLocale, useScopedT } from "@/i18n";
import {
  formatShortcutAccelerator,
  isModifierOnlyKey,
  keyboardEventToShortcutAccelerator,
} from "@/core/shortcuts";
import type { ResolvedShortcutDefinition } from "@/core/shortcuts";
import { SettingsIconButton } from "@/features/settings/components/settings-icon-button";
import { SettingsPanel } from "@/features/settings/components/settings-panel";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import { cn } from "@/lib/utils";
import type { ShortcutOverrideRecord } from "@/types/shell";

type ShortcutFeedback = null | {
  message: string;
  shortcutId: string;
  tone: "error" | "info";
};

export function ShortcutSettingsSection({
  onChange,
  overrides,
}: {
  onChange: (nextOverrides: ShortcutOverrideRecord) => void;
  overrides: ShortcutOverrideRecord;
}) {
  const section = settingsSections.find((item) => item.id === "app") ?? settingsSections[0];

  return (
    <SettingsSection
      section={section}
      badge={tx("settings", "badges.appliesInstantly")}
    >
      <ShortcutSettingsPanel onChange={onChange} overrides={overrides} />
    </SettingsSection>
  );
}

export function ShortcutSettingsPanel({
  onChange,
  overrides,
}: {
  onChange: (nextOverrides: ShortcutOverrideRecord) => void;
  overrides: ShortcutOverrideRecord;
}) {
  const manager = useShortcutManager();
  const t = useScopedT("settings");
  const { locale } = useLocale();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ShortcutFeedback>(null);

  const shortcuts = useMemo(
    () => manager.resolveShortcuts(overrides),
    [manager, overrides],
  );
  const groupedShortcuts = useMemo(
    () => ({
      global: shortcuts.filter((shortcut) => shortcut.kind === "global"),
      local: shortcuts.filter((shortcut) => shortcut.kind === "local"),
    }),
    [shortcuts],
  );
  const recordingShortcut = useMemo(
    () => shortcuts.find((shortcut) => shortcut.id === recordingId) ?? null,
    [recordingId, shortcuts],
  );
  const customizedCount = Object.keys(overrides).length;

  const updateShortcutOverride = useCallback(
    (shortcut: ResolvedShortcutDefinition, accelerator: string | null) => {
      const nextOverrides = { ...overrides };

      if (accelerator === shortcut.defaultAccelerator) {
        delete nextOverrides[shortcut.id];
      } else {
        nextOverrides[shortcut.id] = {
          accelerator,
        };
      }

      const conflicts = manager.findConflicts(shortcut.id, accelerator, nextOverrides);

      if (conflicts.length > 0) {
        setFeedback({
          message: t("shortcuts.messages.conflict", {
            values: {
              labels: conflicts.map((item) => item.label).join(locale === "zh-CN" ? "、" : ", "),
            },
          }),
          shortcutId: shortcut.id,
          tone: "error",
        });
        return;
      }

      onChange(nextOverrides);
      setFeedback(null);
      setRecordingId(null);
    },
    [locale, manager, onChange, overrides, t],
  );

  const restoreShortcutDefault = useCallback(
    (shortcutId: string) => {
      const nextOverrides = { ...overrides };
      delete nextOverrides[shortcutId];
      onChange(nextOverrides);

      setFeedback(null);
      if (recordingId === shortcutId) {
        setRecordingId(null);
      }
    },
    [onChange, overrides, recordingId],
  );

  const restoreAllShortcuts = useCallback(() => {
    onChange({});
    setRecordingId(null);
    setFeedback(null);
  }, [onChange]);

  useEffect(() => {
    if (!recordingShortcut || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const isEscapeCancel =
        event.key === "Escape"
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !event.shiftKey;

      if (isEscapeCancel) {
        setRecordingId(null);
        setFeedback(null);
        return;
      }

      const accelerator = keyboardEventToShortcutAccelerator(event);
      if (!accelerator) {
        if (isModifierOnlyKey(event.key)) {
          setFeedback({
            message: t("shortcuts.messages.modifierOnly"),
            shortcutId: recordingShortcut.id,
            tone: "info",
          });
        }
        return;
      }

      updateShortcutOverride(recordingShortcut, accelerator);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        setRecordingId(null);
        setFeedback(null);
        return;
      }

      const activeRecordButton = document.querySelector<HTMLElement>(
        `[data-shortcut-record-button-id="${recordingShortcut.id}"]`,
      );

      if (activeRecordButton?.contains(target)) {
        return;
      }

      setRecordingId(null);
      setFeedback({
        message: t("shortcuts.messages.cancelled"),
        shortcutId: recordingShortcut.id,
        tone: "info",
      });
    };

    const handleWindowBlur = () => {
      setRecordingId(null);
      setFeedback({
        message: t("shortcuts.messages.cancelledOnBlur"),
        shortcutId: recordingShortcut.id,
        tone: "info",
      });
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [recordingShortcut, t, updateShortcutOverride]);

  return (
    <div className="space-y-3">
      {customizedCount > 0 ? (
        <div className="flex justify-end">
          <SettingsIconButton
            label={t("actions.restoreAllShortcuts")}
            onClick={restoreAllShortcuts}
          >
            <RotateCcw className="size-4" />
          </SettingsIconButton>
        </div>
      ) : null}
      <ShortcutGroup
        editable
        feedback={feedback}
        label={t("shortcuts.groups.global.label")}
        note={t("shortcuts.groups.global.note")}
        onDisable={updateShortcutOverride}
        onRestore={restoreShortcutDefault}
        onToggleRecord={setRecordingId}
        overrides={overrides}
        platform={manager.platform}
        recordingId={recordingId}
        shortcuts={groupedShortcuts.global}
      />
      <ShortcutGroup
        editable={false}
        feedback={feedback}
        label={t("shortcuts.groups.local.label")}
        note={t("shortcuts.groups.local.note")}
        onDisable={updateShortcutOverride}
        onRestore={restoreShortcutDefault}
        onToggleRecord={setRecordingId}
        overrides={overrides}
        platform={manager.platform}
        recordingId={recordingId}
        shortcuts={groupedShortcuts.local}
      />
    </div>
  );
}

function ShortcutGroup({
  editable,
  feedback,
  label,
  note,
  onDisable,
  onRestore,
  onToggleRecord,
  overrides,
  platform,
  recordingId,
  shortcuts,
}: {
  editable: boolean;
  feedback: ShortcutFeedback;
  label: string;
  note: string;
  onDisable: (shortcut: ResolvedShortcutDefinition, accelerator: string | null) => void;
  onRestore: (shortcutId: string) => void;
  onToggleRecord: (shortcutId: string | null) => void;
  overrides: ShortcutOverrideRecord;
  platform: "browser" | "linux" | "macos" | "windows";
  recordingId: string | null;
  shortcuts: ResolvedShortcutDefinition[];
}) {
  const t = useScopedT("settings");
  const tCommon = useScopedT("common");

  if (shortcuts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="px-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      <SettingsPanel>
        {shortcuts.map((shortcut) => {
          const isRecording = recordingId === shortcut.id;
          const isCustomized =
            editable && Object.prototype.hasOwnProperty.call(overrides, shortcut.id);
          const isDisabled = !shortcut.accelerator;
          const currentKeys = formatShortcutAccelerator(shortcut.accelerator, platform);
          const defaultKeys = formatShortcutAccelerator(shortcut.defaultAccelerator, platform);

          return (
            <div
              key={shortcut.id}
              className={cn(
                "border-b border-border/70 px-4 py-3 last:border-b-0",
                isRecording ? "bg-primary/8" : "bg-transparent",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{shortcut.label}</p>
                    {isRecording ? <Badge variant="warning">{t("shortcuts.badges.recording")}</Badge> : null}
                    {isCustomized ? <Badge>{t("shortcuts.badges.custom")}</Badge> : null}
                    {isDisabled ? <Badge variant="secondary">{t("shortcuts.badges.off")}</Badge> : null}
                    {!editable ? <Badge variant="outline">{t("shortcuts.badges.readOnly")}</Badge> : null}
                  </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  {currentKeys.length > 0 ? (
                    <Kbd keys={currentKeys} />
                  ) : (
                    <span className="text-sm text-muted-foreground">{tCommon("labels.unassigned")}</span>
                  )}

                  {editable ? (
                    <>
                      <SettingsIconButton
                        label={isRecording ? t("shortcuts.actions.stopRecording") : t("shortcuts.actions.record")}
                        onClick={() => onToggleRecord(isRecording ? null : shortcut.id)}
                        variant={isRecording ? "secondary" : "outline"}
                        buttonProps={{
                          "data-shortcut-record-button-id": shortcut.id,
                          "aria-pressed": isRecording,
                        }}
                      >
                        {isRecording ? (
                          <Pause className="size-4" />
                        ) : (
                          <SquarePen className="size-4" />
                        )}
                      </SettingsIconButton>
                      <SettingsIconButton
                        label={t("shortcuts.actions.disable")}
                        onClick={() => onDisable(shortcut, null)}
                      >
                        <Slash className="size-4" />
                      </SettingsIconButton>
                      {isCustomized ? (
                        <SettingsIconButton
                          label={t("shortcuts.actions.restoreDefault")}
                          tooltipContent={
                            defaultKeys.length > 0 ? (
                              <span className="inline-flex items-center gap-2">
                                <span>{t("shortcuts.actions.restoreDefault")}</span>
                                <span className="inline-flex align-middle">
                                  <Kbd keys={defaultKeys} />
                                </span>
                              </span>
                            ) : (
                              t("shortcuts.actions.restoreDefault")
                            )
                          }
                          onClick={() => onRestore(shortcut.id)}
                        >
                          <RotateCcw className="size-4" />
                        </SettingsIconButton>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              {editable && feedback?.shortcutId === shortcut.id ? (
                <p
                  className={`mt-2 text-sm ${
                    feedback.tone === "error" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {feedback.message}
                </p>
              ) : editable && isRecording ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("shortcuts.messages.listening")}
                </p>
              ) : null}
            </div>
          );
        })}
      </SettingsPanel>
    </div>
  );
}
