import { Languages, Moon, Palette, Sun, SunMoon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import { getSupportedAppLocales, localeLabels, tx, useLocale, useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ThemeMode, ThemeName } from "@/lib/theme";
import type { AppLocale, AppLocalePreference } from "@/types/shell";

const modeOptions = [
  {
    value: "light",
    label: "Light",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    icon: SunMoon,
  },
] as const satisfies readonly {
  icon: typeof Sun;
  label: string;
  value: ThemeMode;
}[];

const themeOptions = [
  {
    value: "tino",
    label: "Tino",
    previewClassName:
      "from-[oklch(0.97_0.02_98)] via-[oklch(0.94_0.02_164)] to-[oklch(0.88_0.05_176)] dark:from-[oklch(0.24_0.02_96)] dark:via-[oklch(0.29_0.03_170)] dark:to-[oklch(0.54_0.1_171)]",
  },
  {
    value: "ocean",
    label: "Ocean",
    previewClassName:
      "from-[oklch(0.96_0.02_245)] via-[oklch(0.92_0.04_225)] to-[oklch(0.8_0.09_240)] dark:from-[oklch(0.22_0.02_245)] dark:via-[oklch(0.29_0.05_232)] dark:to-[oklch(0.56_0.11_241)]",
  },
] as const satisfies readonly {
  label: string;
  previewClassName: string;
  value: ThemeName;
}[];

function optionButtonClassName(active: boolean) {
  return active
    ? "border-primary/30 bg-primary/10 shadow-sm"
    : "border-border/80 bg-surface-elevated hover:border-primary/20 hover:bg-secondary/70";
}

export function AppearanceSettingsSection({
  localePreference,
  mode,
  onLocalePreferenceChange,
  setMode,
  setThemeName,
  themeName,
}: {
  localePreference: AppLocalePreference;
  mode: ThemeMode;
  onLocalePreferenceChange: (value: AppLocalePreference) => void | Promise<void>;
  setMode: (value: ThemeMode) => void;
  setThemeName: (value: ThemeName) => void;
  themeName: ThemeName;
}) {
  const section = settingsSections[2];
  const t = useScopedT("settings");
  const { locale: resolvedLocale } = useLocale();
  const supportedLocales = getSupportedAppLocales();
  const localeValue = localePreference.locale ?? "en-US";

  return (
    <SettingsSection section={section} badge={tx("settings", "badges.appliesInstantly")}>
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            label={t("appearance.mode.label")}
            description={t("appearance.mode.description")}
          >
            <div className="flex flex-wrap gap-2">
              {modeOptions.map((option) => {
                const active = mode === option.value;
                const Icon = option.icon;
                const label = t(`appearance.mode.options.${option.value}`);

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
                    <Icon className="size-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </SettingField>

          <SettingField
            label={t("appearance.language.label")}
            description={(
              <span className="space-y-1">
                <span className="block">{t("appearance.language.description")}</span>
                <span className="block">
                  {t("appearance.language.currentValue", {
                    values: {
                      locale: localeLabels[resolvedLocale],
                    },
                  })}
                </span>
              </span>
            )}
            action={(
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Languages className="size-3.5" />
              </span>
            )}
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
            label={t("appearance.palette.label")}
            description={t("appearance.palette.description")}
            action={(
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Palette className="size-3.5" />
              </span>
            )}
          >
            <div className="flex flex-wrap gap-2">
              {themeOptions.map((option) => {
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
                      {active ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                          {t("appearance.palette.active")}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
