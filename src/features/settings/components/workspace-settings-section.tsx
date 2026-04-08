import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { FolderOpen, FolderSearch } from "lucide-react";

import { queryKeys } from "@/app/query-keys";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardSourceAppAvatar } from "@/features/settings/components/clipboard-source-app-avatar";
import { ClipboardSourceAppCombobox } from "@/features/settings/components/clipboard-source-app-combobox";
import { SettingsIconButton } from "@/features/settings/components/settings-icon-button";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import {
  appendClipboardSourceAppRule,
  formatClipboardExcludedKeywords,
  parseClipboardExcludedKeywordsInput,
  removeClipboardSourceAppRule,
} from "@/features/settings/lib/clipboard-filter-settings";
import { settingsSections } from "@/features/settings/settings-sections";
import { getClipboardSourceAppIcons, listClipboardSourceApps } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { SettingsDraft } from "@/types/shell";

const clipboardRetentionOptions = [
  {
    value: 1,
    label: "1 day",
    description: "Tight",
  },
  {
    value: 3,
    label: "3 days",
    description: "Balanced",
  },
  {
    value: 7,
    label: "7 days",
    description: "Extended",
  },
  {
    value: 14,
    label: "14 days",
    description: "Maximum",
  },
] as const;

export function WorkspaceSettingsSection({
  onPickKnowledgeRoot,
  onRevealKnowledgeRoot,
  patchSettingsDraft,
  settingsDraft,
}: {
  onPickKnowledgeRoot: () => Promise<void>;
  onRevealKnowledgeRoot: () => Promise<void>;
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections[0];
  const [keywordInputDraft, setKeywordInputDraft] = useState<string | null>(null);
  const [shouldLoadSourceApps, setShouldLoadSourceApps] = useState(false);
  const [sourceAppIconMap, setSourceAppIconMap] = useState<Record<string, string | null>>({});
  const sourceAppIconMapRef = useRef<Record<string, string | null>>({});
  const pendingSourceAppIconPathsRef = useRef(new Set<string>());
  const sourceAppIconQueueRef = useRef<string[]>([]);
  const sourceAppIconPumpActiveRef = useRef(false);
  const sourceAppIconPumpTimerRef = useRef<number | null>(null);
  const sourceAppsQuery = useQuery({
    queryKey: queryKeys.clipboardSourceApps(),
    queryFn: listClipboardSourceApps,
    enabled: shouldLoadSourceApps,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });
  const sourceAppOptions = useMemo(
    () =>
      (sourceAppsQuery.data ?? []).map((option) => ({
        ...option,
        iconPath:
          (option.appPath ? sourceAppIconMap[option.appPath] : undefined) ?? option.iconPath,
      })),
    [sourceAppIconMap, sourceAppsQuery.data],
  );
  const selectedBundleIds = new Set(
    settingsDraft.clipboardExcludedSourceApps.map((rule) => rule.bundleId.toLowerCase()),
  );
  const keywordInput =
    keywordInputDraft ?? formatClipboardExcludedKeywords(settingsDraft.clipboardExcludedKeywords);
  const sourceAppOptionMap = useMemo(
    () =>
      new Map(
        sourceAppOptions.map((option) => [
          option.bundleId.toLowerCase(),
          option,
        ]),
      ),
    [sourceAppOptions],
  );
  const selectedSourceApps = settingsDraft.clipboardExcludedSourceApps.map((rule) => {
    const option = sourceAppOptionMap.get(rule.bundleId.toLowerCase());
    const appPath = option?.appPath ?? null;

    return {
      appName: option?.appName ?? rule.appName,
      bundleId: rule.bundleId,
      appPath,
      iconPath:
        (appPath ? sourceAppIconMap[appPath] : undefined) ?? option?.iconPath ?? null,
    };
  });

  useEffect(() => {
    sourceAppIconMapRef.current = sourceAppIconMap;
  }, [sourceAppIconMap]);

  const pumpSourceAppIconQueue = useCallback(async () => {
    if (sourceAppIconPumpActiveRef.current) {
      return;
    }

    const nextPath = sourceAppIconQueueRef.current.shift();
    if (!nextPath) {
      return;
    }

    sourceAppIconPumpActiveRef.current = true;
    pendingSourceAppIconPathsRef.current.add(nextPath);

    try {
      const [icon] = await getClipboardSourceAppIcons([nextPath]);
      if (!icon) {
        return;
      }

      setSourceAppIconMap((current) => {
        if (current[icon.appPath] === icon.iconPath) {
          return current;
        }

        return {
          ...current,
          [icon.appPath]: icon.iconPath,
        };
      });
    } finally {
      pendingSourceAppIconPathsRef.current.delete(nextPath);
      sourceAppIconPumpActiveRef.current = false;

      if (sourceAppIconQueueRef.current.length > 0) {
        sourceAppIconPumpTimerRef.current = window.setTimeout(() => {
          void pumpSourceAppIconQueue();
        }, 48);
      }
    }
  }, []);

  const enqueueSourceAppIcons = useCallback((appPaths: string[]) => {
    const queue = sourceAppIconQueueRef.current;

    for (const appPath of appPaths) {
      if (!appPath) {
        continue;
      }
      if (sourceAppIconMapRef.current[appPath] !== undefined) {
        continue;
      }
      if (pendingSourceAppIconPathsRef.current.has(appPath)) {
        continue;
      }
      if (queue.includes(appPath)) {
        continue;
      }

      queue.push(appPath);
    }

    if (queue.length === 0 || sourceAppIconPumpActiveRef.current) {
      return;
    }

    if (sourceAppIconPumpTimerRef.current !== null) {
      window.clearTimeout(sourceAppIconPumpTimerRef.current);
    }

    sourceAppIconPumpTimerRef.current = window.setTimeout(() => {
      void pumpSourceAppIconQueue();
    }, 120);
  }, [pumpSourceAppIconQueue]);

  useEffect(() => () => {
    if (sourceAppIconPumpTimerRef.current !== null) {
      window.clearTimeout(sourceAppIconPumpTimerRef.current);
    }
  }, []);

  useEffect(() => {
    enqueueSourceAppIcons(
      selectedSourceApps
        .map((app) => app.appPath)
        .filter((appPath): appPath is string => Boolean(appPath)),
    );
  }, [enqueueSourceAppIcons, selectedSourceApps]);

  return (
    <SettingsSection
      section={section}
      badge={settingsDraft.knowledgeRoot ? "Configured" : "Needs attention"}
    >
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            htmlFor="knowledge-root"
            label="Knowledge root"
            description="Archive folder."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="knowledge-root"
                value={settingsDraft.knowledgeRoot}
                onChange={(event) =>
                  patchSettingsDraft({ knowledgeRoot: event.target.value })
                }
                placeholder="~/tino-inbox"
                className="min-w-[260px] flex-1"
              />
              <SettingsIconButton
                label="Pick folder"
                onClick={() => void onPickKnowledgeRoot()}
              >
                <FolderSearch />
              </SettingsIconButton>
              <SettingsIconButton
                label="Reveal folder"
                disabled={!settingsDraft.knowledgeRoot}
                onClick={() => void onRevealKnowledgeRoot()}
              >
                <FolderOpen />
              </SettingsIconButton>
            </div>
          </SettingField>

          <SettingField
            label="Clipboard cache retention"
            description="Keep recent clipboard captures available in the board without touching long-lived daily records."
          >
            <div className="flex flex-wrap gap-2">
              {clipboardRetentionOptions.map((option) => {
                const active = settingsDraft.clipboardHistoryDays === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      patchSettingsDraft({ clipboardHistoryDays: option.value })
                    }
                    className={`min-w-[104px] flex-1 basis-[112px] rounded-[18px] border px-3 py-3 text-left transition ${
                      active
                        ? "border-primary/30 bg-primary/10 shadow-sm"
                        : "border-border/80 bg-surface-elevated hover:border-primary/20 hover:bg-secondary/70"
                    }`}
                    aria-pressed={active}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingField>

          <SettingField
            label="Excluded source apps"
            action={
              settingsDraft.clipboardExcludedSourceApps.length ? (
                <Badge variant="secondary">
                  {settingsDraft.clipboardExcludedSourceApps.length} app
                  {settingsDraft.clipboardExcludedSourceApps.length > 1 ? "s" : ""}
                </Badge>
              ) : undefined
            }
            description="Search installed apps inline. Runtime matching still uses the captured bundle ID, and excluded captures continue to write filter logs."
          >
            <div className="space-y-4">
              <ClipboardSourceAppCombobox
                isLoading={sourceAppsQuery.isLoading}
                onActivate={() => {
                  setShouldLoadSourceApps(true);
                }}
                onVisibleOptionsChange={(options) => {
                  enqueueSourceAppIcons(
                    options
                      .map((option) => option.appPath)
                      .filter((appPath): appPath is string => Boolean(appPath)),
                  );
                }}
                errorMessage={
                  sourceAppsQuery.error instanceof Error
                    ? sourceAppsQuery.error.message
                    : sourceAppsQuery.error
                      ? "Failed to load installed apps."
                      : null
                }
                options={sourceAppOptions}
                selectedBundleIds={selectedBundleIds}
                onSelect={(option) => {
                  patchSettingsDraft({
                    clipboardExcludedSourceApps: appendClipboardSourceAppRule(
                      settingsDraft.clipboardExcludedSourceApps,
                      option,
                    ),
                  });
                }}
              />

              {selectedSourceApps.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                  No source apps are excluded.
                </div>
              ) : (
                <div className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  {selectedSourceApps.map((app, index) => (
                    <div
                      key={app.bundleId}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3",
                        index > 0 ? "border-t border-border/65" : "",
                      )}
                    >
                      <ClipboardSourceAppAvatar
                        appName={app.appName}
                        iconPath={app.iconPath}
                        className="size-12 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-medium text-foreground">
                          {app.appName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {app.bundleId}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked="true"
                        aria-label={`Stop excluding ${app.appName}`}
                        onClick={() =>
                          patchSettingsDraft({
                            clipboardExcludedSourceApps: removeClipboardSourceAppRule(
                              settingsDraft.clipboardExcludedSourceApps,
                              app.bundleId,
                            ),
                          })
                        }
                        className="inline-flex h-8 w-[4.1rem] shrink-0 items-center rounded-full bg-primary px-1 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.1)] transition hover:brightness-[0.98]"
                      >
                        <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.16)]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SettingField>

          <SettingField
            htmlFor="clipboard-excluded-keywords"
            label="Excluded keywords"
            action={
              settingsDraft.clipboardExcludedKeywords.length ? (
                <Badge variant="secondary">
                  {settingsDraft.clipboardExcludedKeywords.length} keyword
                  {settingsDraft.clipboardExcludedKeywords.length > 1 ? "s" : ""}
                </Badge>
              ) : undefined
            }
            description="Use `;` to separate keywords. If the captured raw text contains any keyword, that capture is skipped and logged."
          >
            <div className="space-y-2">
              <Textarea
                id="clipboard-excluded-keywords"
                value={keywordInput}
                onChange={(event) => {
                  const nextInput = event.target.value;
                  setKeywordInputDraft(nextInput);
                  patchSettingsDraft({
                    clipboardExcludedKeywords:
                      parseClipboardExcludedKeywordsInput(nextInput),
                  });
                }}
                onBlur={() => {
                  setKeywordInputDraft(null);
                }}
                placeholder="password; verification code; internal only"
                className="min-h-24"
              />
              <p className="text-xs text-muted-foreground">
                Matching is case-insensitive and runs against the raw clipboard text before the
                capture is archived.
              </p>
            </div>
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
