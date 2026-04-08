import { resolveAssetUrl } from "@/lib/tauri";
import { cn } from "@/lib/utils";

export function ClipboardSourceAppAvatar({
  appName,
  className,
  iconPath,
}: {
  appName: string;
  className?: string;
  iconPath?: string | null;
}) {
  const iconSrc = resolveAssetUrl(iconPath);
  const fallbackLabel = appName.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-[14px] border border-black/8 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={appName}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className="text-sm font-semibold text-foreground/70">
          {fallbackLabel}
        </span>
      )}
    </span>
  );
}
