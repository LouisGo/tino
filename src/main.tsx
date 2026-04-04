import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppProviders } from "@/app/providers";
import { installRendererLogging } from "@/lib/logger";
import { bootstrapTheme } from "@/lib/theme";
import { router } from "@/router";

import "./index.css";

installRendererLogging();
bootstrapTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders router={router} />
  </StrictMode>,
);
