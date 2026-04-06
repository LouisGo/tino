import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/app/query-keys"
import { getAutostartEnabled, setAutostartEnabled } from "@/lib/tauri"

export function useAutostartSetting() {
  const queryClient = useQueryClient()

  const { data: autostartEnabled } = useQuery({
    queryKey: queryKeys.autostartEnabled(),
    queryFn: getAutostartEnabled,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  })

  const toggleAutostartMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await setAutostartEnabled(enabled)
      return enabled
    },
    onMutate: async (nextEnabled) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.autostartEnabled() })
      const previousEnabled = queryClient.getQueryData<boolean>(
        queryKeys.autostartEnabled(),
      )

      queryClient.setQueryData(queryKeys.autostartEnabled(), nextEnabled)
      return { previousEnabled }
    },
    onError: (_error, _nextEnabled, context) => {
      queryClient.setQueryData(
        queryKeys.autostartEnabled(),
        context?.previousEnabled,
      )
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(queryKeys.autostartEnabled(), enabled)
    },
  })

  return {
    autostartEnabled: autostartEnabled ?? false,
    toggleAutostartMutation,
  }
}
