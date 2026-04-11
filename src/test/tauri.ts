import {
  clearMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
} from "@tauri-apps/api/mocks";

export const defaultTauriTestWindow = "main";
export const defaultAdditionalTauriTestWindows = ["clipboard"] as const;

function createUnhandledTauriCommandError(command: string) {
  return new Error(
    `Unhandled Tauri IPC mock for "${command}". Add an explicit mockIPC handler in this test.`,
  );
}

export function installBaseTauriMocks({
  currentWindow = defaultTauriTestWindow,
  additionalWindows = [...defaultAdditionalTauriTestWindows],
}: {
  currentWindow?: string;
  additionalWindows?: string[];
} = {}) {
  const dedupedLabels = Array.from(
    new Set([currentWindow, ...additionalWindows].filter(Boolean)),
  );
  const [primaryWindow, ...secondaryWindows] = dedupedLabels;

  mockWindows(primaryWindow, ...secondaryWindows);
  mockConvertFileSrc("macos");
  mockIPC(
    (command) => {
      throw createUnhandledTauriCommandError(command);
    },
    { shouldMockEvents: true },
  );
}

export function resetBaseTauriMocks() {
  clearMocks();
  installBaseTauriMocks();
}

export {
  clearMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
};
