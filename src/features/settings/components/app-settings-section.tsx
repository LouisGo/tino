import { useMemo } from "react";

import { FileSearch, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShortcutSettingsPanel } from "@/features/settings/components/shortcut-settings-section";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import { getSupportedAppLocales, localeLabels, useLocale, useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ThemeMode, ThemeName } from "@/lib/theme";
import type { AppLocale, AppLocalePreference, ShortcutOverrideRecord } from "@/types/shell";

const modeOptions = [
  {
    value: "light",
    labelKey: "appearance.mode.options.light",
  },
  {
    value: "dark",
    labelKey: "appearance.mode.options.dark",
  },
  {
    value: "system",
    labelKey: "appearance.mode.options.system",
  },
] as const satisfies readonly {
  labelKey: "appearance.mode.options.dark" | "appearance.mode.options.light" | "appearance.mode.options.system";
  value: ThemeMode;
}[];

const themeOptions = [
  {
    value: "tino",
    labelKey: "appearance.palette.options.tino",
    previewClassName:
      "from-[oklch(0.97_0.02_98)] via-[oklch(0.94_0.02_164)] to-[oklch(0.88_0.05_176)] dark:from-[oklch(0.24_0.02_96)] dark:via-[oklch(0.29_0.03_170)] dark:to-[oklch(0.54_0.1_171)]",
  },
  {
    value: "ocean",
    labelKey: "appearance.palette.options.ocean",
    previewClassName:
      "from-[oklch(0.96_0.02_245)] via-[oklch(0.92_0.04_225)] to-[oklch(0.8_0.09_240)] dark:from-[oklch(0.22_0.02_245)] dark:via-[oklch(0.29_0.05_232)] dark:to-[oklch(0.56_0.11_241)]",
  },
] as const satisfies readonly {
  labelKey: "appearance.palette.options.ocean" | "appearance.palette.options.tino";
  previewClassName: string;
  value: ThemeName;
}[];

function optionButtonClassName(active: boolean) {
  return active
    ? "border-primary/30 bg-primary/10 shadow-sm"
    : "border-border/80 bg-surface-elevated hover:border-primary/20 hover:bg-secondary/70";
}

export function AppSettingsSection({
  autostartEnabled,
  localePreference,
  mode,
  onLocalePreferenceChange,
  onOpenLogs,
  onShortcutOverridesChange,
  onToggleAutostart,
  overrides,
  setMode,
  setThemeName,
  themeName,
  toggleAutostartPending,
}: {
  autostartEnabled: boolean;
  localePreference: AppLocalePreference;
  mode: ThemeMode;
  onLocalePreferenceChange: (value: AppLocalePreference) => void | Promise<void>;
  onOpenLogs: () => Promise<void>;
  onShortcutOverridesChange: (nextOverrides: ShortcutOverrideRecord) => void;
  onToggleAutostart: () => Promise<void>;
  overrides: ShortcutOverrideRecord;
  setMode: (value: ThemeMode) => void;
  setThemeName: (value: ThemeName) => void;
  themeName: ThemeName;
  toggleAutostartPending: boolean;
}) {
  const section = settingsSections.find((item) => item.id === "app") ?? settingsSections[0];
  const t = useScopedT("settings");
  const { locale: resolvedLocale } = useLocale();
  const supportedLocales = getSupportedAppLocales();
  const localeValue = localePreference.locale ?? "en-US";
  const themeOptionItems = useMemo(
    () =>
      themeOptions.map((option) => ({
        ...option,
        activeLabel: option.value === themeName ? t("appearance.palette.active") : null,
        label: t(option.labelKey),
      })),
    [t, themeName],
  );

  return (
    <SettingsSection section={section} badge={t("badges.appliesInstantly")}>
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            label={t("app.launchAtLogin.label")}
            info={t("app.launchAtLogin.info")}
            action={(
              <Badge variant={autostartEnabled ? "success" : "secondary"}>
                {autostartEnabled ? t("app.launchAtLogin.enabled") : t("app.launchAtLogin.disabled")}
              </Badge>
            )}
          >
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={toggleAutostartPending}
                onClick={() => void onToggleAutostart()}
              >
                <Power />
                {toggleAutostartPending
                  ? t("app.launchAtLogin.updating")
                  : t("app.launchAtLogin.toggle")}
              </Button>
            </div>
          </SettingField>

          <SettingField
            label={t("appearance.language.label")}
            info={t("appearance.language.description")}
            description={t("appearance.language.currentValue", {
              values: {
                locale: localeLabels[resolvedLocale],
              },
            })}
          >
            <div className="max-w-[320px]">
              <Select
                value={localeValue}
                onValueChange={(value) => {
                  void onLocalePreferenceChange(
                    {
                      locale: value as AppLocale,
                      mode: "manual",
                    },
                  );
                }}
              >
                <SelectTrigger aria-label={t("appearance.language.label")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLocales.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {localeLabels[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SettingField>

          <SettingField
            label={t("appearance.mode.label")}
            info={t("appearance.mode.description")}
          >
            <div className="flex flex-wrap gap-2">
              {modeOptions.map((option) => {
                const active = mode === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                      optionButtonClassName(active),
                    )}
                    aria-pressed={active}
                  >
                    <span>{t(option.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </SettingField>

          <SettingField
            label={t("appearance.palette.label")}
            info={t("appearance.palette.description")}
          >
            <div className="flex flex-wrap gap-2">
              {themeOptionItems.map((option) => {
                const active = themeName === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setThemeName(option.value)}
                    className={cn(
                      "w-[164px] rounded-[18px] border p-3 text-left transition",
                      optionButtonClassName(active),
                    )}
                    aria-pressed={active}
                  >
                    <div
                      className={cn(
                        "h-10 rounded-[12px] bg-gradient-to-br",
                        option.previewClassName,
                      )}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      {option.activeLabel ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                          {option.activeLabel}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingField>

          <SettingField
            label={t("app.logs.label")}
            info={t("app.logs.info")}
          >
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => void onOpenLogs()}>
                <FileSearch />
                {t("app.logs.open")}
              </Button>
            </div>
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-sm font-medium text-foreground">
            {t("app.shortcuts.label")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("app.shortcuts.summary")}
          </span>
        </div>
        <ShortcutSettingsPanel
          overrides={overrides}
          onChange={onShortcutOverridesChange}
        />
      </div>
    </SettingsSection>
  );
}
