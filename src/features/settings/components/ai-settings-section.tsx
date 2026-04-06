import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveProviderAccessConfig } from "@/features/ai/lib/provider-access";
import { RuntimeProviderTestPanel } from "@/features/settings/components/runtime-provider-test-panel";
import {
  getDefaultRuntimeProviderBaseUrlForModel,
  maskRuntimeProviderApiKey,
  runtimeProviderModels,
  validateRuntimeProviderApiKey,
  validateRuntimeProviderBaseUrl,
  validateRuntimeProviderModel,
} from "@/features/settings/lib/runtime-provider";
import type { RuntimeProviderFormController } from "@/features/settings/hooks/use-runtime-provider-form";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { SettingsDraft } from "@/types/shell";

export function AiSettingsSection({
  runtimeProviderForm,
  settingsDraft,
}: {
  runtimeProviderForm: RuntimeProviderFormController;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections[1];
  const t = useScopedT("settings");
  const providerAccess = resolveProviderAccessConfig(settingsDraft);
  const badge = providerAccess.isConfigured
    ? t("provider.status.ready")
    : settingsDraft.apiKey.trim()
      ? t("provider.status.incomplete")
      : t("provider.status.apiKeyNeeded");
  const { commitApiKey, commitBaseUrl, commitModel, form } = runtimeProviderForm;
  const providerBaseUrlPlaceholder = getDefaultRuntimeProviderBaseUrlForModel(
    form.state.values.model,
  );

  return (
    <SettingsSection section={section} badge={badge}>
      <SettingsPanel>
        <SettingsPanelBody>
          <form.Field
            name="baseUrl"
            validators={{
              onChange: ({ value }) => validateRuntimeProviderBaseUrl(value),
              onBlur: ({ value }) => validateRuntimeProviderBaseUrl(value),
            }}
          >
            {(field) => {
              const message = getFieldMessage(field.state.meta.errors, {
                fallback: t("provider.baseUrl.hint"),
                shouldShowError: field.state.meta.isBlurred,
              });

              return (
                <SettingField
                  htmlFor="provider-base-url"
                  label={t("provider.baseUrl.label")}
                  description={t("provider.baseUrl.description")}
                >
                  <div className="max-w-[420px] space-y-2">
                    <Input
                      id="provider-base-url"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={() => {
                        field.handleBlur();
                        commitBaseUrl(field.state.value);
                      }}
                      placeholder={providerBaseUrlPlaceholder}
                      aria-invalid={message.tone === "error"}
                      aria-describedby="provider-base-url-message"
                      spellCheck={false}
                    />
                    <p
                      id="provider-base-url-message"
                      className={cn(
                        "text-xs leading-5",
                        message.tone === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {message.text}
                    </p>
                  </div>
                </SettingField>
              );
            }}
          </form.Field>

          <form.Field
            name="model"
            validators={{
              onChange: ({ value }) => validateRuntimeProviderModel(value),
            }}
          >
            {(field) => {
              const message = getFieldMessage(field.state.meta.errors, {
                fallback: t("provider.model.hint"),
                shouldShowError: field.state.meta.isTouched,
              });

              return (
                <SettingField
                  htmlFor="provider-model"
                  label={t("provider.model.label")}
                  description={t("provider.model.description")}
                >
                  <div className="max-w-[420px] space-y-2">
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        const nextValue = commitModel(value);
                        field.handleChange(nextValue);
                      }}
                    >
                      <SelectTrigger
                        id="provider-model"
                        aria-label={t("provider.model.label")}
                        aria-invalid={message.tone === "error"}
                        aria-describedby="provider-model-message"
                      >
                        <SelectValue placeholder={t("provider.model.placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {runtimeProviderModels.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex min-w-0 flex-col">
                              <span>{option.label}</span>
                              <span className="text-xs font-normal opacity-80">
                                {option.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p
                      id="provider-model-message"
                      className={cn(
                        "text-xs leading-5",
                        message.tone === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {message.text}
                    </p>
                  </div>
                </SettingField>
              );
            }}
          </form.Field>

          <form.Field
            name="apiKey"
            validators={{
              onChange: ({ value }) => validateRuntimeProviderApiKey(value),
              onBlur: ({ value }) => validateRuntimeProviderApiKey(value),
            }}
          >
            {(field) => {
              const maskedKey = maskRuntimeProviderApiKey(field.state.value);
              const message = getFieldMessage(field.state.meta.errors, {
                fallback: maskedKey
                  ? t("provider.apiKey.maskedValue", { values: { key: maskedKey } })
                  : t("provider.apiKey.hint"),
                shouldShowError: field.state.meta.isBlurred,
              });

              return (
                <SettingField
                  htmlFor="provider-api-key"
                  label={t("provider.apiKey.label")}
                  description={t("provider.apiKey.description")}
                  action={(
                    <Badge variant="secondary" className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5" />
                      {t("provider.apiKey.privateBadge")}
                    </Badge>
                  )}
                >
                  <div className="max-w-[420px] space-y-2">
                    <Input
                      id="provider-api-key"
                      type="password"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={() => {
                        field.handleBlur();
                        commitApiKey(field.state.value);
                      }}
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t("provider.apiKey.placeholder")}
                      aria-invalid={message.tone === "error"}
                      aria-describedby="provider-api-key-message"
                    />
                    <p
                      id="provider-api-key-message"
                      className={cn(
                        "text-xs leading-5",
                        message.tone === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {message.text}
                    </p>
                  </div>
                </SettingField>
              );
            }}
          </form.Field>

          <RuntimeProviderTestPanel providerConfig={form.state.values} />
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}

function getFieldMessage(
  errors: unknown[],
  {
    fallback,
    shouldShowError,
  }: {
    fallback: string;
    shouldShowError: boolean;
  },
) {
  if (!shouldShowError) {
    return {
      text: fallback,
      tone: "muted" as const,
    };
  }

  const firstError = errors.find((value) => typeof value === "string" && value.length > 0);
  if (!firstError || typeof firstError !== "string") {
    return {
      text: fallback,
      tone: "muted" as const,
    };
  }

  return {
    text: firstError,
    tone: "error" as const,
  };
}
