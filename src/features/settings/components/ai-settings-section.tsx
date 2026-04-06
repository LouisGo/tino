import { useState } from "react";

import { ShieldCheck, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getDefaultRuntimeProviderBaseUrlForVendor,
  getDefaultRuntimeProviderModelForVendor,
  getRuntimeProviderModelLabel,
  getRuntimeProviderModelOptions,
  getRuntimeProviderVendorLabel,
  maskRuntimeProviderApiKey,
  normalizeRuntimeProviderVendor,
  runtimeProviderVendors,
  validateRuntimeProviderApiKey,
  validateRuntimeProviderBaseUrl,
  validateRuntimeProviderModel,
  validateRuntimeProviderName,
  validateRuntimeProviderVendor,
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
import type { RuntimeProviderProfile, SettingsDraft } from "@/types/shell";

const defaultModelOverrideSelectValue = "__vendor_default__";

export function AiSettingsSection({
  runtimeProviderForm,
  settingsDraft,
}: {
  runtimeProviderForm: RuntimeProviderFormController;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections[1];
  const t = useScopedT("settings");
  const [providerPendingDelete, setProviderPendingDelete] =
    useState<RuntimeProviderProfile | null>(null);
  const activeProvider = runtimeProviderForm.activeProvider;
  const activeProviderAccess = activeProvider
    ? resolveProviderAccessConfig(activeProvider)
    : null;
  const badge = activeProviderAccess?.isConfigured
    ? t("provider.status.ready")
    : activeProvider?.apiKey.trim()
      ? t("provider.status.incomplete")
      : t("provider.status.apiKeyNeeded");
  const {
    addProvider,
    canDeleteProvider,
    commitApiKey,
    commitBaseUrl,
    commitModel,
    commitName,
    commitVendor,
    deleteProvider,
    form,
    providerProfiles,
    selectProvider,
    selectedProvider,
    selectedProviderId,
    setActiveProvider,
  } = runtimeProviderForm;
  const selectedVendor = normalizeRuntimeProviderVendor(form.state.values.vendor);
  const providerBaseUrlPlaceholder = getDefaultRuntimeProviderBaseUrlForVendor(selectedVendor);
  const providerDefaultModel = getDefaultRuntimeProviderModelForVendor(selectedVendor);
  const providerDefaultModelLabel = getRuntimeProviderModelLabel(
    providerDefaultModel,
    selectedVendor,
  );
  const providerModelOptions = getRuntimeProviderModelOptions(
    selectedVendor,
    form.state.values.model,
  );

  return (
    <SettingsSection
      section={section}
      badge={badge}
      action={(
        <Button type="button" variant="outline" onClick={() => addProvider()}>
          {t("provider.list.add")}
        </Button>
      )}
    >
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            label={t("provider.list.label")}
            description={t("provider.list.description")}
          >
            <div className="space-y-3">
              {providerProfiles.map((profile) => {
                const providerAccess = resolveProviderAccessConfig(profile);
                const isActive = settingsDraft.activeRuntimeProviderId === profile.id;
                const isSelected = selectedProviderId === profile.id;
                const statusLabel = providerAccess.isConfigured
                  ? t("provider.status.ready")
                  : profile.apiKey.trim()
                    ? t("provider.status.incomplete")
                    : t("provider.status.apiKeyNeeded");

                return (
                  <div
                    key={profile.id}
                    className={cn(
                      "rounded-[20px] border px-4 py-3 transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/80 bg-background/60",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {profile.name}
                          </p>
                          {isActive ? (
                            <Badge variant="secondary">{t("provider.list.currentActive")}</Badge>
                          ) : null}
                          <Badge variant="secondary">{statusLabel}</Badge>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {providerAccess.providerLabel}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isSelected ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => selectProvider(profile.id)}
                          >
                            {t("provider.list.edit")}
                          </Button>
                        ) : null}
                        {!isActive ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setActiveProvider(profile.id)}
                          >
                            {t("provider.list.useNow")}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!canDeleteProvider}
                          aria-label={t("provider.list.delete")}
                          onClick={() => setProviderPendingDelete(profile)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!canDeleteProvider ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("provider.list.keepOneHint")}
                </p>
              ) : null}
            </div>
          </SettingField>

          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => validateRuntimeProviderName(value),
              onBlur: ({ value }) => validateRuntimeProviderName(value),
            }}
          >
            {(field) => {
              const message = getFieldMessage(field.state.meta.errors, {
                fallback: t("provider.name.hint"),
                shouldShowError: field.state.meta.isBlurred,
              });

              return (
                <SettingField
                  htmlFor="provider-name"
                  label={t("provider.name.label")}
                >
                  <div className="max-w-[420px] space-y-2">
                    <Input
                      id="provider-name"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={() => {
                        field.handleBlur();
                        commitName(field.state.value);
                      }}
                      placeholder={t("provider.name.placeholder")}
                      aria-invalid={message.tone === "error"}
                      aria-describedby="provider-name-message"
                      spellCheck={false}
                    />
                    <p
                      id="provider-name-message"
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
            name="vendor"
            validators={{
              onChange: ({ value }) => validateRuntimeProviderVendor(value),
            }}
          >
            {(field) => {
              const message = getFieldMessage(field.state.meta.errors, {
                fallback: t("provider.vendor.hint"),
                shouldShowError: field.state.meta.isTouched,
              });

              return (
                <SettingField
                  htmlFor="provider-vendor"
                  label={t("provider.vendor.label")}
                >
                  <div className="max-w-[420px] space-y-2">
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        const nextValue = commitVendor(value);
                        field.handleChange(nextValue);
                      }}
                    >
                      <SelectTrigger
                        id="provider-vendor"
                        aria-label={t("provider.vendor.label")}
                        aria-invalid={message.tone === "error"}
                        aria-describedby="provider-vendor-message"
                      >
                        <SelectValue placeholder={t("provider.vendor.placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {runtimeProviderVendors.map((option) => (
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
                      id="provider-vendor-message"
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
              onBlur: ({ value }) => validateRuntimeProviderModel(value),
            }}
          >
            {(field) => {
              const message = getFieldMessage(field.state.meta.errors, {
                fallback: t("provider.model.hint", {
                  values: {
                    model: providerDefaultModelLabel,
                  },
                }),
                shouldShowError: field.state.meta.isBlurred,
              });

              return (
                <SettingField
                  htmlFor="provider-model"
                  label={t("provider.model.label")}
                  description={t("provider.model.description")}
                >
                  <div className="max-w-[420px] space-y-2">
                    <Select
                      value={field.state.value || defaultModelOverrideSelectValue}
                      onValueChange={(value) => {
                        const nextValue =
                          value === defaultModelOverrideSelectValue
                            ? commitModel("")
                            : commitModel(value);
                        field.handleChange(nextValue);
                        field.handleBlur();
                      }}
                    >
                      <SelectTrigger
                        id="provider-model"
                        aria-label={t("provider.model.label")}
                        aria-invalid={message.tone === "error"}
                        aria-describedby="provider-model-message"
                      >
                        <SelectValue
                          placeholder={t("provider.model.placeholder", {
                            values: {
                              model: providerDefaultModelLabel,
                            },
                          })}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={defaultModelOverrideSelectValue}
                          textValue={t("provider.model.defaultOptionLabel")}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span>{t("provider.model.defaultOptionLabel")}</span>
                            <span className="text-xs font-normal opacity-80">
                              {t("provider.model.defaultOptionHint", {
                                values: {
                                  model: providerDefaultModelLabel,
                                },
                              })}
                            </span>
                          </div>
                        </SelectItem>

                        {providerModelOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            textValue={option.label}
                          >
                            <div className="flex min-w-0 flex-col">
                              <span>{option.label}</span>
                              {option.description ? (
                                <span className="text-xs font-normal opacity-80">
                                  {option.description}
                                </span>
                              ) : null}
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

          {selectedProvider && selectedProvider.id !== settingsDraft.activeRuntimeProviderId ? (
            <div className="px-4 pb-4 text-xs leading-5 text-muted-foreground">
              {t("provider.test.inactiveHint", {
                values: {
                  active: activeProvider?.name ?? "",
                  editing: selectedProvider.name,
                },
              })}
            </div>
          ) : null}
        </SettingsPanelBody>
      </SettingsPanel>

      <AlertDialog
        open={Boolean(providerPendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setProviderPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-[min(25rem,calc(100vw-2rem))]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("provider.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("provider.delete.description", {
                values: {
                  name: providerPendingDelete?.name ?? "",
                  vendor:
                    providerPendingDelete
                      ? getRuntimeProviderVendorLabel(providerPendingDelete.vendor)
                      : "",
                },
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("provider.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (providerPendingDelete) {
                  deleteProvider(providerPendingDelete.id);
                }
                setProviderPendingDelete(null);
              }}
            >
              {t("provider.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
