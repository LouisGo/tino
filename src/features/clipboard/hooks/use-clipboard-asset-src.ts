import { useQuery } from "@tanstack/react-query";

import { getImageAssetDataUrl } from "@/lib/tauri";

export function useClipboardAssetSrc(assetPath?: string | null) {
  const { data } = useQuery({
    queryKey: ["clipboard-asset-src", assetPath],
    enabled: Boolean(assetPath),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (!assetPath) {
        return null;
      }

      try {
        return await getImageAssetDataUrl(assetPath);
      } catch {
        return null;
      }
    },
  });

  return data ?? null;
}
