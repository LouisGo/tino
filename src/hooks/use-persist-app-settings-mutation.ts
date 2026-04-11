import PQueue from "p-queue";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import {
  applyIncomingAppSettingsChange,
  emitAppSettingsChanged,
} from "@/lib/app-settings-sync";
import {
  getAppSettings,
  saveAppSettings,
} from "@/lib/tauri";
import type { SettingsDraft } from "@/types/shell";

const appSettingsSaveQueue = new PQueue({
  concurrency: 1,
});

export type PersistAppSettingsInput =
  | SettingsDraft
  | ((previousPersisted: SettingsDraft) => SettingsDraft | Promise<SettingsDraft>);

export type PersistAppSettingsResult = {
  previousPersisted: SettingsDraft;
  requestedDraft: SettingsDraft;
  saved: SettingsDraft;
};

export function usePersistAppSettingsMutation(options?: {
  onError?: (error: unknown, input: PersistAppSettingsInput) => void;
  onSuccess?: (
    result: PersistAppSettingsResult,
    input: PersistAppSettingsInput,
  ) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: queryKeys.appSettingsSave(),
    mutationFn: async (input: PersistAppSettingsInput): Promise<PersistAppSettingsResult> =>
      appSettingsSaveQueue.add(async () => {
        const previousPersisted =
          queryClient.getQueryData<SettingsDraft>(queryKeys.appSettings())
          ?? await getAppSettings();
        const requestedDraft = typeof input === "function"
          ? await input(previousPersisted)
          : input;
        const saved = await saveAppSettings(requestedDraft);

        return {
          previousPersisted,
          requestedDraft,
          saved,
        };
      }),
    onError: (error, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appSettings() });
      options?.onError?.(error, input);
    },
    onSuccess: async (result, input) => {
      applyIncomingAppSettingsChange(queryClient, {
        previous: result.previousPersisted,
        saved: result.saved,
      });
      await emitAppSettingsChanged({
        previous: result.previousPersisted,
        saved: result.saved,
      });
      await options?.onSuccess?.(result, input);
    },
  });
}
