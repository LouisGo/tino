import { useCallback, useEffect, useMemo, useState } from "react";

import { Keyboard, RotateCcw, Slash, SquarePen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutManager } from "@/core/shortcuts";
import {
  formatShortcutAccelerator,
  isModifierOnlyKey,
  keyboardEventToShortcutAccelerator,
} from "@/core/shortcuts";
import type { ResolvedShortcutDefinition } from "@/core/shortcuts";
import type {
  ShortcutOverrideRecord,
} from "@/types/shell";

export function ShortcutSettingsPanel({
  overrides,
  onChange,
}: {
  overrides: ShortcutOverrideRecord;
  onChange: (nextOverrides: ShortcutOverrideRecord) => void;
}) {
  const manager = useShortcutManager();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<null | {
    message: string;
    shortcutId: string;
    tone: "error" | "info";
  }>(null);

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

  const updateShortcutOverride = useCallback((
    shortcut: ResolvedShortcutDefinition,
    accelerator: string | null,
  ) => {
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
        message: `Conflicts with ${conflicts.map((item) => item.label).join(", ")}.`,
        shortcutId: shortcut.id,
        tone: "error",
      });
      return;
    }

    onChange(nextOverrides);
    setFeedback(null);
    setRecordingId(null);
  }, [manager, onChange, overrides]);

  const restoreShortcutDefault = useCallback((shortcutId: string) => {
    const nextOverrides = { ...overrides };
    delete nextOverrides[shortcutId];
    onChange(nextOverrides);

    setFeedback(null);
    if (recordingId === shortcutId) {
      setRecordingId(null);
    }
  }, [onChange, overrides, recordingId]);

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
            message: "Modifier keys are only prefixes. Keep holding them, then press a main key.",
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
    <Card>
      <CardHeader>
        <CardTitle>Shortcuts</CardTitle>
        <CardDescription>
          Global shortcuts are system-level and keep working while the app is hidden.
          Local shortcuts only apply inside the active Tino scope stack.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ShortcutGroup
          kind="global"
          label="System Global"
          shortcuts={groupedShortcuts.global}
          editable
          overrides={overrides}
          platform={manager.platform}
          recordingId={recordingId}
          feedback={feedback}
          onDisable={updateShortcutOverride}
          onRestore={restoreShortcutDefault}
          onToggleRecord={setRecordingId}
        />
        <ShortcutGroup
          kind="local"
          label="In-App Local"
          shortcuts={groupedShortcuts.local}
          editable={false}
          overrides={overrides}
          platform={manager.platform}
          recordingId={recordingId}
          feedback={feedback}
          onDisable={updateShortcutOverride}
          onRestore={restoreShortcutDefault}
          onToggleRecord={setRecordingId}
        />
      </CardContent>
    </Card>
  );
}

function ShortcutGroup({
  feedback,
  kind,
  label,
  editable,
  onDisable,
  onRestore,
  onToggleRecord,
  overrides,
  platform,
  recordingId,
  shortcuts,
}: {
  feedback: null | { message: string; shortcutId: string; tone: "error" | "info" };
  kind: "global" | "local";
  label: string;
  editable: boolean;
  onDisable: (shortcut: ResolvedShortcutDefinition, accelerator: string | null) => void;
  onRestore: (shortcutId: string) => void;
  onToggleRecord: (shortcutId: string | null) => void;
  overrides: ShortcutOverrideRecord;
  platform: "macos" | "windows" | "linux" | "browser";
  recordingId: string | null;
  shortcuts: ResolvedShortcutDefinition[];
}) {
  if (shortcuts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={kind === "global" ? "warning" : "secondary"}>{label}</Badge>
        <p className="text-sm text-muted-foreground">
          {kind === "global"
            ? "Registered through the system shortcut plugin."
            : "Resolved through the active shortcut scope stack. These bindings are read-only."}
        </p>
      </div>

      <div className="space-y-3">
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
              className={`rounded-[20px] border bg-card/75 p-4 transition ${
                isRecording
                  ? "border-primary/50 ring-2 ring-primary/15"
                  : "border-border/80"
              }`}
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{shortcut.label}</p>
                    <Badge variant="outline">{shortcut.id}</Badge>
                    {isRecording ? <Badge variant="warning">Recording</Badge> : null}
                    {editable && isCustomized ? <Badge variant="default">Customized</Badge> : null}
                    {isDisabled ? <Badge variant="secondary">Unassigned</Badge> : null}
                    {!editable ? <Badge variant="outline">Read Only</Badge> : null}
                  </div>
                  {shortcut.description ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      {shortcut.description}
                    </p>
                  ) : null}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {shortcut.kind === "global"
                      ? "System-global binding"
                      : `Scopes: ${shortcut.scopes.join(", ")}`}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 xl:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    {currentKeys.length > 0 ? (
                      <Kbd keys={currentKeys} />
                    ) : (
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    )}
                    {editable ? (
                      <>
                        <Button
                          type="button"
                          variant={isRecording ? "default" : "outline"}
                          data-shortcut-capture="true"
                          data-shortcut-record-button-id={shortcut.id}
                          aria-pressed={isRecording}
                          onClick={() => onToggleRecord(isRecording ? null : shortcut.id)}
                        >
                          <SquarePen className="size-4" />
                          {isRecording ? "Press Keys" : "Record"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onDisable(shortcut, null)}
                        >
                          <Slash className="size-4" />
                          Disable
                        </Button>
                        {isCustomized ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onRestore(shortcut.id)}
                          >
                            <RotateCcw className="size-4" />
                            Restore
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  {editable && isCustomized && defaultKeys.length > 0 ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Keyboard className="size-3.5" />
                      Default
                      <Kbd keys={defaultKeys} className="gap-1.5" />
                    </p>
                  ) : null}
                </div>
              </div>

              {editable && feedback?.shortcutId === shortcut.id ? (
                <p
                  className={`mt-3 text-sm ${
                    (feedback?.tone ?? "info") === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {feedback?.message}
                </p>
              ) : editable && isRecording ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Listening for the next shortcut. Press `Esc` to cancel.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
