import type { Window } from "@tauri-apps/api/window";

import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";

const WINDOW_HIDE_SETTLE_ATTEMPTS = 6;
const WINDOW_HIDE_SETTLE_INTERVAL_MS = 8;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForWindowToHide(window: Window) {
  for (let attempt = 0; attempt < WINDOW_HIDE_SETTLE_ATTEMPTS; attempt += 1) {
    try {
      if (!(await window.isVisible())) {
        return true;
      }
    } catch {
      return true;
    }

    await delay(WINDOW_HIDE_SETTLE_INTERVAL_MS);
  }

  return false;
}

export function resetClipboardWindowSession() {
  useClipboardBoardStore.getState().resetWindowSession();
}

export async function hideClipboardWindowForNextOpen(window: Window) {
  let isVisible = true;

  try {
    isVisible = await window.isVisible();
  } catch {
    isVisible = true;
  }

  if (isVisible) {
    try {
      await window.hide();
    } catch {
      return;
    }

    await waitForWindowToHide(window);
  }

  resetClipboardWindowSession();
}
