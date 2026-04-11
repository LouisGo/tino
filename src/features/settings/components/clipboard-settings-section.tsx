import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Pause, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardSourceAppAvatar } from "@/features/settings/components/clipboard-source-app-avatar";
import { ClipboardSourceAppCombobox } from "@/features/settings/components/clipboard-source-app-combobox";
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
import {
  cacheClipboardSourceAppIcons,
  clipboardSourceAppsQueryOptions,
  getCachedClipboardSourceApps,
} from "@/features/settings/lib/clipboard-source-app-query";
import { settingsSections } from "@/features/settings/settings-sections";
import { useScopedT } from "@/i18n";
import { getClipboardSourceAppIcons } from "@/lib/tauri";
import type { SettingsDraft } from "@/types/shell";

export function ClipboardSettingsSection({
  onToggleCapture,
  patchSettingsDraft,
  settingsDraft,
}: {
  onToggleCapture: () => void;
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections.find((item) => item.id === "clipboard") ?? settingsSections[0];
  const t = useScopedT("settings");
  const queryClient = useQueryClient();
  const [keywordInputDraft, setKeywordInputDraft] = useState<string | null>(null);
  const pendingSourceAppIconPathsRef = useRef(new Set<string>());
  const resolvedSourceAppIconPathsRef = useRef(new Set<string>());
  const sourceAppIconQueueRef = useRef<string[]>([]);
  const sourceAppIconPumpActiveRef = useRef(false);
  const sourceAppIconPumpTimerRef = useRef<number | null>(null);
  const sourceAppsQuery = useQuery({
    ...clipboardSourceAppsQueryOptions(queryClient),
    placeholderData: (previousData) => previousData,
    refetchOnMount: "always",
  });
  const sourceAppOptions = useMemo(
    () => sourceAppsQuery.data ?? [],
    [sourceAppsQuery.data],
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
  const retentionOptions = useMemo(
    () => [
      {
        value: 1,
        label: t("clipboard.retention.options.oneDay.label"),
        tone: t("clipboard.retention.options.oneDay.tone"),
      },
      {
        value: 3,
        label: t("clipboard.retention.options.threeDays.label"),
        tone: t("clipboard.retention.options.threeDays.tone"),
      },
      {
        value: 7,
        label: t("clipboard.retention.options.sevenDays.label"),
        tone: t("clipboard.retention.options.sevenDays.tone"),
      },
      {
        value: 90,
        label: t("clipboard.retention.options.ninetyDays.label"),
        tone: t("clipboard.retention.options.ninetyDays.tone"),
      },
    ],
    [t],
  );
  const duplicateSelectedAppNames = useMemo(() => {
    const counts = new Map<string, number>();

    for (const app of settingsDraft.clipboardExcludedSourceApps) {
      const key = app.appName.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  }, [settingsDraft.clipboardExcludedSourceApps]);
  const selectedSourceApps = settingsDraft.clipboardExcludedSourceApps.map((rule) => {
    const option = sourceAppOptionMap.get(rule.bundleId.toLowerCase());
    const appPath = option?.appPath ?? null;

    return {
      appName: option?.appName ?? rule.appName,
      bundleId: rule.bundleId,
      appPath,
      iconPath: option?.iconPath ?? null,
    };
  });

  const pumpSourceAppIconQueue = useCallback(async () => {
    if (sourceAppIconPumpActiveRef.current) {
      return;
    }

    const nextPaths = sourceAppIconQueueRef.current.splice(0, 6);
    if (nextPaths.length === 0) {
      return;
    }

    sourceAppIconPumpActiveRef.current = true;
    for (const appPath of nextPaths) {
      pendingSourceAppIconPathsRef.current.add(appPath);
    }

    try {
      cacheClipboardSourceAppIcons(
        queryClient,
        await getClipboardSourceAppIcons(nextPaths),
      );
    } finally {
      for (const appPath of nextPaths) {
        pendingSourceAppIconPathsRef.current.delete(appPath);
        resolvedSourceAppIconPathsRef.current.add(appPath);
      }
      sourceAppIconPumpActiveRef.current = false;

      if (sourceAppIconQueueRef.current.length > 0) {
        sourceAppIconPumpTimerRef.current = window.setTimeout(() => {
          void pumpSourceAppIconQueue();
        }, 48);
      }
    }
  }, [queryClient]);

  const enqueueSourceAppIcons = useCallback((appPaths: string[]) => {
    const queue = sourceAppIconQueueRef.current;
    const cachedOptions = getCachedClipboardSourceApps(queryClient) ?? sourceAppsQuery.data ?? [];
    const cachedIconPaths = new Map(
      cachedOptions
        .map((option) =>
          option.appPath?.trim() && option.iconPath
            ? [option.appPath.trim(), option.iconPath] as const
            : null)
        .filter((entry): entry is readonly [string, string] => Boolean(entry)),
    );

    for (const appPath of appPaths) {
      const normalizedPath = appPath.trim();
      if (!normalizedPath) {
        continue;
      }
      if (cachedIconPaths.has(normalizedPath)) {
        continue;
      }
      if (pendingSourceAppIconPathsRef.current.has(normalizedPath)) {
        continue;
      }
      if (resolvedSourceAppIconPathsRef.current.has(normalizedPath)) {
        continue;
      }
      if (queue.includes(normalizedPath)) {
        continue;
      }

      queue.push(normalizedPath);
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
  }, [pumpSourceAppIconQueue, queryClient, sourceAppsQuery.data]);

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
      badge={settingsDraft.clipboardCaptureEnabled ? t("badges.running") : t("badges.paused")}
      action={(
        <Button type="button" variant="outline" size="sm" onClick={onToggleCapture}>
          {settingsDraft.clipboardCaptureEnabled ? <Pause /> : <Play />}
          {settingsDraft.clipboardCaptureEnabled
            ? t("clipboard.capture.pause")
            : t("clipboard.capture.resume")}
        </Button>
      )}
    >
      <SettingsPanel className="overflow-visible">
        <SettingsPanelBody>
          <SettingField
            label={t("clipboard.retention.label")}
            info={t("clipboard.retention.info")}
          >
            <div className="flex flex-wrap gap-2">
              {retentionOptions.map((option) => {
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
                        {option.tone}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingField>

          <SettingField
            label={t("clipboard.sourceApps.label")}
            info={t("clipboard.sourceApps.info")}
            action={settingsDraft.clipboardExcludedSourceApps.length > 0
              ? <Badge variant="secondary">{settingsDraft.clipboardExcludedSourceApps.length}</Badge>
              : undefined}
          >
            <div className="space-y-4">
              <ClipboardSourceAppCombobox
                isLoading={!sourceAppsQuery.data && sourceAppsQuery.isFetching}
                onActivate={() => {
                  if (!sourceAppsQuery.isFetching) {
                    void sourceAppsQuery.refetch();
                  }
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
                      ? t("clipboard.sourceApps.loadError")
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
                  {t("clipboard.sourceApps.empty")}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[24px] border border-border/70 bg-surface-panel shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="space-y-1 p-2">
                    {selectedSourceApps.map((app) => {
                      const showSecondaryLine = duplicateSelectedAppNames.has(
                        app.appName.trim().toLowerCase(),
                      );

                      return (
                        <div
                          key={app.bundleId}
                          className="flex items-center gap-2.5 rounded-[14px] px-2.5 py-1.5"
                        >
                          <ClipboardSourceAppAvatar
                            appName={app.appName}
                            iconPath={app.iconPath}
                            className="size-7 shrink-0 rounded-[8px]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] leading-4 font-medium text-foreground">
                              {app.appName}
                            </p>
                            {showSecondaryLine ? (
                              <p className="truncate text-[10px] leading-4 text-muted-foreground">
                                {app.bundleId}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            aria-label={t("clipboard.sourceApps.remove", {
                              values: { appName: app.appName },
                            })}
                            onClick={() =>
                              patchSettingsDraft({
                                clipboardExcludedSourceApps: removeClipboardSourceAppRule(
                                  settingsDraft.clipboardExcludedSourceApps,
                                  app.bundleId,
                                ),
                              })
                            }
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                          >
                            <Minus className="size-3.5 stroke-[2.2]" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </SettingField>

          <SettingField
            htmlFor="clipboard-excluded-keywords"
            label={t("clipboard.keywords.label")}
            info={t("clipboard.keywords.info")}
            action={settingsDraft.clipboardExcludedKeywords.length > 0
              ? <Badge variant="secondary">{settingsDraft.clipboardExcludedKeywords.length}</Badge>
              : undefined}
          >
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
              placeholder={t("clipboard.keywords.placeholder")}
              className="min-h-24"
            />
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
