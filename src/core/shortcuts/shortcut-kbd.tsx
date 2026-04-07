import { Kbd, type KbdSize } from "@/components/ui/kbd";
import { useScopedT } from "@/i18n";
import { useAppShortcut, useShortcutManager } from "@/core/shortcuts/hooks";
import { formatShortcutAccelerator } from "@/core/shortcuts/utils";

export function ShortcutKbd({
  className,
  size = "md",
  shortcutId,
  whenDisabled = "hidden",
}: {
  className?: string;
  size?: KbdSize;
  shortcutId: string;
  whenDisabled?: "hidden" | "placeholder";
}) {
  const shortcut = useAppShortcut(shortcutId);
  const { platform } = useShortcutManager();
  const t = useScopedT("common");

  if (!shortcut?.accelerator) {
    if (whenDisabled === "placeholder") {
      return <span className="text-xs text-muted-foreground">{t("labels.unassigned")}</span>;
    }

    return null;
  }

  return (
    <Kbd
      className={className}
      keys={formatShortcutAccelerator(shortcut.accelerator, platform)}
      size={size}
    />
  );
}
