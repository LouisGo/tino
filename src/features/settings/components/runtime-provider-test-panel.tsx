import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, LoaderCircle, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
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
  const providerAccess = resolveProviderAccessConfig(providerConfig);

  const testMutation = useMutation({
    mutationFn: async () => runRuntimeProviderSmokeTest(providerConfig),
  });

  const canRun = providerAccess.isConfigured;

  return (
    <SettingField
      label={t("provider.test.label")}
      description={t("provider.test.description")}
    >
      <div className="max-w-[720px]">
        <div
          className={cn(
            "space-y-3 rounded-[22px] border p-3.5",
            testMutation.isError
              ? "border-destructive/30 bg-destructive/5"
              : testMutation.isSuccess
                ? "app-tone-success app-tone-panel"
                : "border-border/80 bg-background/60",
          )}
        >
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

          <div className="text-sm leading-6">
            {!canRun ? (
              <p className="text-muted-foreground">
                {t("provider.test.disabledBody")}
              </p>
            ) : testMutation.isPending ? (
              <p className="text-muted-foreground">
                {t("provider.test.pendingBody")}
              </p>
            ) : testMutation.isError ? (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                  {testMutation.error instanceof Error
                    ? testMutation.error.message
                    : t("provider.test.unknownError")}
                </p>
              </div>
            ) : testMutation.isSuccess ? (
              <div className="flex items-start gap-2 font-medium text-emerald-900 dark:text-emerald-100">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                  {t("provider.test.successBody")}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {t("provider.test.idleBody")}
              </p>
            )}
          </div>
        </div>
      </div>
    </SettingField>
  );
}
