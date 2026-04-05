import { useEffect, useState } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { useShortcutScope } from "@/core/shortcuts";
import { ClipboardBoardFeature } from "@/features/clipboard/components/clipboard-board-feature";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { isTauriRuntime } from "@/lib/tauri";

export function ClipboardWindowPage() {
  const [sessionKey, setSessionKey] = useState(0);
  useShortcutScope("clipboard.window");

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let unlistenFocus = () => {};
    const rootElement = document.getElementById("root");
    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    const rootStyle = rootElement?.style;
    const previousHtmlOverflow = htmlStyle.overflow;
    const previousHtmlHeight = htmlStyle.height;
    const previousHtmlBackgroundColor = htmlStyle.backgroundColor;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousBodyHeight = bodyStyle.height;
    const previousBodyBackgroundImage = bodyStyle.backgroundImage;
    const previousBodyBackgroundColor = bodyStyle.backgroundColor;
    const previousRootOverflow = rootStyle?.overflow ?? "";
    const previousRootHeight = rootStyle?.height ?? "";
    const previousRootBackground = rootStyle?.background ?? "";
    const interactiveSelector = [
      "button",
      "input",
      "textarea",
      "select",
      "option",
      "a",
      "[role='button']",
      "[contenteditable='true']",
      ".app-selectable",
      "img",
      "svg",
    ].join(", ");

    htmlStyle.overflow = "hidden";
    htmlStyle.height = "100%";
    htmlStyle.backgroundColor = "transparent";
    bodyStyle.overflow = "hidden";
    bodyStyle.height = "100%";
    bodyStyle.backgroundImage = "none";
    bodyStyle.backgroundColor = "transparent";
    if (rootStyle) {
      rootStyle.overflow = "hidden";
      rootStyle.height = "100%";
      rootStyle.background = "transparent";
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(interactiveSelector)) {
        return;
      }

      void currentWindow.startDragging();
    };

    window.addEventListener("mousedown", handleMouseDown);

    void currentWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        useClipboardBoardStore.getState().resetState();
        void currentWindow.hide();
        return;
      }

      useClipboardBoardStore.getState().resetState();
      setSessionKey((current) => current + 1);
    }).then((dispose) => {
      unlistenFocus = dispose;
    });

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      unlistenFocus();
      htmlStyle.overflow = previousHtmlOverflow;
      htmlStyle.height = previousHtmlHeight;
      htmlStyle.backgroundColor = previousHtmlBackgroundColor;
      bodyStyle.overflow = previousBodyOverflow;
      bodyStyle.height = previousBodyHeight;
      bodyStyle.backgroundImage = previousBodyBackgroundImage;
      bodyStyle.backgroundColor = previousBodyBackgroundColor;
      if (rootStyle) {
        rootStyle.overflow = previousRootOverflow;
        rootStyle.height = previousRootHeight;
        rootStyle.background = previousRootBackground;
      }
    };
  }, []);

  return (
    <ClipboardBoardFeature
      key={sessionKey}
      showSummary={false}
      fillHeight
      windowMode
      autoFocusSearch
    />
  );
}
