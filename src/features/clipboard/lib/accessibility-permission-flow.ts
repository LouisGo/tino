import { confirm, message } from "@tauri-apps/plugin-dialog";

import { resolveText, tx } from "@/i18n";
import { requestAppRestart } from "@/lib/tauri";

export function formatAccessibilityPermissionDialog() {
  return resolveText(
    tx("common", "clipboardPermission.enableDialogBody"),
  );
}

export async function promptForAccessibilityRestart() {
  const restartNow = await confirm(
    resolveText(tx("common", "clipboardPermission.restartDialogBody")),
    {
      cancelLabel: resolveText(
        tx("common", "clipboardPermission.restartDialogLater"),
      ),
      kind: "warning",
      okLabel: resolveText(
        tx("common", "clipboardPermission.restartDialogConfirm"),
      ),
      title: resolveText(
        tx("common", "clipboardPermission.restartDialogTitle"),
      ),
    },
  );

  if (!restartNow) {
    return false;
  }

  await requestAppRestart();
  return true;
}

export async function showAccessibilityPermissionDialog() {
  await message(formatAccessibilityPermissionDialog(), {
    kind: "warning",
    title: resolveText(
      tx("common", "clipboardPermission.enableDialogTitle"),
    ),
  });
}
