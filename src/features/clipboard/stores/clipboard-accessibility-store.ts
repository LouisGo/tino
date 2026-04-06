import { create } from "zustand";

export type ClipboardAccessibilityPhase =
  | "idle"
  | "awaitingGrant"
  | "restartRequired";

type ClipboardAccessibilityState = {
  details: string | null;
  phase: ClipboardAccessibilityPhase;
  beginPermissionGrantFlow: (details: string) => void;
  markRestartRequired: () => void;
};

export const useClipboardAccessibilityStore =
  create<ClipboardAccessibilityState>((set) => ({
    details: null,
    phase: "idle",
    beginPermissionGrantFlow: (details) =>
      set((state) =>
        state.phase === "restartRequired"
          ? state
          : {
              details,
              phase: "awaitingGrant",
            },
      ),
    markRestartRequired: () =>
      set((state) =>
        state.phase === "restartRequired"
          ? state
          : {
              ...state,
              phase: "restartRequired",
            },
      ),
  }));
