import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { AppProviders } from "@/app/providers";
import { queryClient } from "@/app/query-client";
import { primeClipboardBoardQueries } from "@/features/clipboard/lib/clipboard-query-bootstrap";
import { bootstrapI18n } from "@/i18n";
import { createRendererLogger, installRendererLogging } from "@/lib/logger";
import { bootstrapTheme } from "@/lib/theme";
import { isTauriRuntime } from "@/lib/tauri";
import { router } from "@/router";

import "./index.css";

const logger = createRendererLogger("app.bootstrap");

installRendererLogging();
bootstrapTheme();
bootstrapI18n();

function isClipboardPanelWindow() {
  return isTauriRuntime() && getCurrentWindow().label === "clipboard";
}

function scheduleClipboardBootstrapPrime() {
  const prime = () => {
    void primeClipboardBoardQueries(queryClient).catch((error) => {
      logger.warn("Failed to prime clipboard bootstrap queries", error);
    });
  };

  if (isClipboardPanelWindow()) {
    void import("@/features/clipboard/clipboard-window-page");
    prime();
    return;
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prime, { timeout: 1_200 });
    return;
  }

  window.setTimeout(prime, 250);
}

scheduleClipboardBootstrapPrime();

document.documentElement.style.backgroundColor = "var(--background)";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders router={router} />
  </StrictMode>,
);
