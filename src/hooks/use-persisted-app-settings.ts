import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { getAppSettings } from "@/lib/tauri";

export function usePersistedAppSettings() {
  return useQuery({
    queryKey: queryKeys.appSettings(),
    queryFn: getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });
}
