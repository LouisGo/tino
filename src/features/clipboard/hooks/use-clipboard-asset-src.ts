import { resolveAssetUrl } from "@/lib/tauri";

export function useClipboardAssetSrc(assetPath?: string | null) {
  return resolveAssetUrl(assetPath);
}
