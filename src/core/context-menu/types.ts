import type { ReactNode } from "react";

import type { AppCommandId } from "@/core/commands";
import type { CommandExecutor } from "@/core/commands";

export type ContextMenuRuntime = {
  commands: CommandExecutor;
  closeMenu: () => void;
};

export type ContextMenuResolvedItem = {
  key: string;
  type: "item" | "separator";
  label?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void | Promise<void>;
};

export type ContextMenuItemDefinition<Context> =
  | {
      key: string;
      type: "separator";
    }
  | {
      key: string;
      type?: "item";
      label: ReactNode | ((context: Context) => ReactNode);
      icon?: ReactNode | ((context: Context) => ReactNode);
      danger?: boolean | ((context: Context) => boolean);
      hidden?: (context: Context, runtime: ContextMenuRuntime) => boolean;
      disabled?: (context: Context, runtime: ContextMenuRuntime) => boolean;
      command?: {
        id: AppCommandId;
        payload: (context: Context) => unknown;
      };
      onSelect?: (
        context: Context,
        runtime: ContextMenuRuntime,
      ) => void | Promise<void>;
    };

