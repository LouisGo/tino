import { createContext } from "react";

import type { ShortcutManager } from "@/core/shortcuts/types";

export const ShortcutManagerContext = createContext<ShortcutManager | null>(null);
