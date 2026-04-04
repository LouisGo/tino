import { useEffect, useState } from "react";

import { isTauriRuntime, loadImageAssetDataUrl } from "@/lib/tauri";

export function useClipboardAssetSrc(assetPath?: string | null) {
  const [blobAssetState, setBlobAssetState] = useState<{
    path: string | null;
    url: string | null;
  }>({ path: null, url: null });

  useEffect(() => {
    if (
      !assetPath
      || assetPath.startsWith("data:")
      || assetPath.startsWith("blob:")
      || !isTauriRuntime()
    ) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const dataUrl = await loadImageAssetDataUrl(assetPath);
        if (cancelled) {
          return;
        }

        setBlobAssetState({ path: assetPath, url: dataUrl });
      } catch {
        if (!cancelled) {
          setBlobAssetState({ path: assetPath, url: null });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetPath]);

  if (!assetPath) {
    return null;
  }

  if (assetPath.startsWith("data:") || assetPath.startsWith("blob:")) {
    return assetPath;
  }

  if (!isTauriRuntime()) {
    return assetPath;
  }

  return blobAssetState.path === assetPath ? blobAssetState.url : null;
}
