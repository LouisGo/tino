import { useCallback, useEffect, useMemo, useState } from "react";

import { Pause, RotateCcw, Slash, SquarePen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutManager } from "@/core/shortcuts";
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
  const manager = useShortcutManager();
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
          message: `Already used by ${conflicts.map((item) => item.label).join(", ")}. Choose another key or restore the other shortcut.`,
          shortcutId: shortcut.id,
          tone: "error",
        });
        return;
      }

      onChange(nextOverrides);
      setFeedback(null);
      setRecordingId(null);
    },
    [manager, onChange, overrides],
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
            message:
              "Modifier keys are only prefixes. Keep holding them, then press a main key.",
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
        message: "Recording cancelled.",
        shortcutId: recordingShortcut.id,
        tone: "info",
      });
    };

    const handleWindowBlur = () => {
      setRecordingId(null);
      setFeedback({
        message: "Recording cancelled because the window lost focus.",
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
  }, [recordingShortcut, updateShortcutOverride]);

  return (
    <SettingsSection
      section={settingsSections[4]}
      badge="Applies instantly"
      action={customizedCount > 0
        ? (
            <SettingsIconButton
              label="Restore all shortcuts"
              onClick={restoreAllShortcuts}
            >
              <RotateCcw className="size-4" />
            </SettingsIconButton>
          )
        : null}
    >
      <div className="space-y-3">
        <ShortcutGroup
          editable
          feedback={feedback}
          label="System-global"
          note="Applies everywhere and saves immediately."
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
          label="In-app"
          note="Read-only reference."
          onDisable={updateShortcutOverride}
          onRestore={restoreShortcutDefault}
          onToggleRecord={setRecordingId}
          overrides={overrides}
          platform={manager.platform}
          recordingId={recordingId}
          shortcuts={groupedShortcuts.local}
        />
      </div>
    </SettingsSection>
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
                    {isRecording ? <Badge variant="warning">Recording</Badge> : null}
                    {isCustomized ? <Badge>Custom</Badge> : null}
                    {isDisabled ? <Badge variant="secondary">Off</Badge> : null}
                    {!editable ? <Badge variant="outline">Read only</Badge> : null}
                  </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  {currentKeys.length > 0 ? (
                    <Kbd keys={currentKeys} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}

                  {editable ? (
                    <>
                      <SettingsIconButton
                        label={isRecording ? "Stop recording" : "Record shortcut"}
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
                        label="Disable shortcut"
                        onClick={() => onDisable(shortcut, null)}
                      >
                        <Slash className="size-4" />
                      </SettingsIconButton>
                      {isCustomized ? (
                        <SettingsIconButton
                          label="Restore default shortcut"
                          onClick={() => onRestore(shortcut.id)}
                        >
                          <RotateCcw className="size-4" />
                        </SettingsIconButton>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              {editable && isCustomized && defaultKeys.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Default:{" "}
                  <span className="inline-flex align-middle">
                    <Kbd keys={defaultKeys} />
                  </span>
                </p>
              ) : null}

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
                  Listening for the next shortcut. Press `Esc` to cancel.
                </p>
              ) : null}
            </div>
          );
        })}
      </SettingsPanel>
    </div>
  );
}
