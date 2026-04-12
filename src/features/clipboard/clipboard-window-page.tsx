import { useEffect, useState } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { useContextMenuStore } from "@/core/context-menu";
import { useShortcutScope } from "@/core/shortcuts";
import { ClipboardBoardFeature } from "@/features/clipboard/components/clipboard-board-feature";
import { hideClipboardWindowForNextOpen } from "@/features/clipboard/lib/clipboard-window-session";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { isTauriRuntime } from "@/lib/tauri";

const WINDOW_DRAG_REGION_SELECTOR = "[data-window-drag-region='true']";
const WINDOW_DRAG_EXCLUDED_SELECTOR = [
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
  "[data-window-drag-disabled='true']",
  "[data-slot='context-menu-content']",
  "[role='dialog']",
].join(", ");

export function ClipboardWindowPage() {
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
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

      if (!target.closest(WINDOW_DRAG_REGION_SELECTOR)) {
        return;
      }

      if (target.closest(WINDOW_DRAG_EXCLUDED_SELECTOR)) {
        return;
      }

      void currentWindow.startDragging();
    };

    window.addEventListener("mousedown", handleMouseDown);

    void currentWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        useContextMenuStore.getState().closeMenu();
        useClipboardBoardStore.getState().closeTransientLayers();
        void hideClipboardWindowForNextOpen(currentWindow);
        return;
      }

      setSearchFocusRequest((current) => current + 1);
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
    <div
      data-panel-window-root="true"
      className="app-panel-window-root h-full"
    >
      <ClipboardBoardFeature
        showSummary={false}
        fillHeight
        windowMode
        autoFocusSearch
        searchFocusRequest={searchFocusRequest}
      />
    </div>
  );
}
