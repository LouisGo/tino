import { createContext } from "react";

import type { CommandExecutor } from "@/core/commands/executor";

export const CommandExecutorContext = createContext<CommandExecutor | null>(null);

