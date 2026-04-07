import { create } from "zustand";

type ContextMenuTargetRegistration = {
  isEnabled?: () => boolean;
  openMenu: () => boolean | Promise<boolean>;
};

type ContextMenuTargetEntry = ContextMenuTargetRegistration & {
  key: number;
};

type ContextMenuTargetStore = {
  targets: ContextMenuTargetEntry[];
  activateTarget: (target: ContextMenuTargetRegistration) => () => void;
  hasActiveTarget: () => boolean;
  openActiveTarget: () => Promise<boolean>;
};

function resolveTargetEnabled(target: ContextMenuTargetEntry) {
  try {
    return target.isEnabled ? target.isEnabled() : true;
  } catch (error) {
    console.error("[context-menu] failed to evaluate active target", error);
    return false;
  }
}

function getActiveTarget(targets: ContextMenuTargetEntry[]) {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    if (target && resolveTargetEnabled(target)) {
      return target;
    }
  }

  return null;
}

let contextMenuTargetSerial = 0;

export const useContextMenuTargetStore = create<ContextMenuTargetStore>((set, get) => ({
  targets: [],
  activateTarget: (target) => {
    const key = ++contextMenuTargetSerial;

    set((state) => ({
      targets: [...state.targets, { ...target, key }],
    }));

    return () => {
      set((state) => ({
        targets: state.targets.filter((entry) => entry.key !== key),
      }));
    };
  },
  hasActiveTarget: () => getActiveTarget(get().targets) !== null,
  openActiveTarget: async () => {
    const target = getActiveTarget(get().targets);
    if (!target) {
      return false;
    }

    try {
      return await Promise.resolve(target.openMenu());
    } catch (error) {
      console.error("[context-menu] failed to open active target", error);
      return false;
    }
  },
}));
