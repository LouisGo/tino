const CLIPBOARD_CAPTURE_PAUSE_GUIDE_DISMISSED_KEY =
  "tino.clipboard-capture-pause-guide-dismissed";

export function getClipboardCapturePauseGuideDismissed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(CLIPBOARD_CAPTURE_PAUSE_GUIDE_DISMISSED_KEY) === "1";
}

export function dismissClipboardCapturePauseGuide() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CLIPBOARD_CAPTURE_PAUSE_GUIDE_DISMISSED_KEY, "1");
}

export function resetClipboardCapturePauseGuideDismissed() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CLIPBOARD_CAPTURE_PAUSE_GUIDE_DISMISSED_KEY);
}
