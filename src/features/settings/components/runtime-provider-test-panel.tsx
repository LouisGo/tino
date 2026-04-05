import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getRuntimeProviderSmokeTestPrompt,
  resolveProviderAccessConfig,
  runRuntimeProviderSmokeTest,
  type ProviderAccessConfig,
} from "@/features/ai/lib/provider-access";
import { SettingField } from "@/features/settings/components/setting-field";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";

export function RuntimeProviderTestPanel({
  providerConfig,
}: {
  providerConfig: ProviderAccessConfig;
}) {
  const t = useScopedT("settings");
  const [prompt, setPrompt] = useState(getRuntimeProviderSmokeTestPrompt);
  const providerAccess = resolveProviderAccessConfig(providerConfig);
  const trimmedPrompt = prompt.trim();

  const testMutation = useMutation({
    mutationFn: async () => runRuntimeProviderSmokeTest(providerConfig, trimmedPrompt),
  });

  const canRun = providerAccess.isConfigured && trimmedPrompt.length > 0;

  return (
    <SettingField
      label={t("provider.test.label")}
      description={t("provider.test.description")}
    >
      <div className="max-w-[720px] space-y-3">
        <div className="rounded-[22px] border border-border/80 bg-surface-elevated/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t("provider.test.promptLabel")}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("provider.test.promptHint")}
              </p>
            </div>
            <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              {providerAccess.providerLabel}
            </div>
          </div>

          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-3 min-h-[110px] bg-background/80"
            placeholder={getRuntimeProviderSmokeTestPrompt()}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-muted-foreground">
              {t("provider.test.supportHint")}
            </p>

            <Button
              type="button"
              onClick={() => {
                testMutation.mutate();
              }}
              disabled={!canRun || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Wand2 />
              )}
              {testMutation.isPending
                ? t("provider.test.running")
                : t("provider.test.run")}
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "rounded-[22px] border p-4",
            testMutation.isError
              ? "border-destructive/30 bg-destructive/5"
              : "border-border/80 bg-background/60",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {testMutation.isSuccess ? <CheckCircle2 className="size-4 text-primary" /> : null}
            <span>{t("provider.test.resultLabel")}</span>
          </div>

          {testMutation.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("provider.test.pendingBody")}
            </p>
          ) : testMutation.isError ? (
            <p className="mt-3 text-sm leading-6 text-destructive">
              {testMutation.error instanceof Error
                ? testMutation.error.message
                : t("provider.test.unknownError")}
            </p>
          ) : testMutation.isSuccess ? (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {testMutation.data.text}
              </p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {t("provider.test.meta", {
                  values: {
                    durationMs: String(testMutation.data.durationMs),
                    finishReason: testMutation.data.finishReason,
                    inputTokens: formatTokenCount(testMutation.data.inputTokens),
                    outputTokens: formatTokenCount(testMutation.data.outputTokens),
                    responseModel: testMutation.data.responseModel,
                  },
                })}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {canRun
                ? t("provider.test.idleBody")
                : t("provider.test.disabledBody")}
            </p>
          )}
        </div>
      </div>
    </SettingField>
  );
}

function formatTokenCount(value: number | undefined) {
  return value === undefined ? "-" : String(value);
}
