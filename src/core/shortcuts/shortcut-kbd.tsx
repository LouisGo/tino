import { Kbd } from "@/components/ui/kbd";
import { useAppShortcut, useShortcutManager } from "@/core/shortcuts/hooks";
import { formatShortcutAccelerator } from "@/core/shortcuts/utils";

export function ShortcutKbd({
  shortcutId,
  whenDisabled = "hidden",
}: {
  shortcutId: string;
  whenDisabled?: "hidden" | "placeholder";
}) {
  const shortcut = useAppShortcut(shortcutId);
  const { platform } = useShortcutManager();

  if (!shortcut?.accelerator) {
    if (whenDisabled === "placeholder") {
      return <span className="text-xs text-muted-foreground">Unassigned</span>;
    }

    return null;
  }

  return <Kbd keys={formatShortcutAccelerator(shortcut.accelerator, platform)} />;
}
