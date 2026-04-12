import { describe, expect, it } from "vitest";

import { defaultAppLocalePreference } from "@/i18n";
import {
  shouldResetClipboardCapturePauseGuideDismissed,
} from "@/features/clipboard/lib/clipboard-capture-pause-guide";
import type { SettingsDraft } from "@/types/shell";

function createSettingsDraft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return {
    revision: 1,
    knowledgeRoot: "/tmp/tino-a",
    runtimeProviderProfiles: [],
    activeRuntimeProviderId: "",
    localePreference: defaultAppLocalePreference(),
    clipboardHistoryDays: 7,
    clipboardCaptureEnabled: true,
    clipboardExcludedSourceApps: [],
    clipboardExcludedKeywords: [],
    shortcutOverrides: {},
    ...overrides,
  };
}

describe("shouldResetClipboardCapturePauseGuideDismissed", () => {
  it("returns true only when clipboard capture resumes from paused to enabled", () => {
    expect(
      shouldResetClipboardCapturePauseGuideDismissed(
        createSettingsDraft({ clipboardCaptureEnabled: false }),
        createSettingsDraft({ clipboardCaptureEnabled: true }),
      ),
    ).toBe(true);

    expect(
      shouldResetClipboardCapturePauseGuideDismissed(
        createSettingsDraft({ clipboardCaptureEnabled: true }),
        createSettingsDraft({ clipboardCaptureEnabled: true }),
      ),
    ).toBe(false);

    expect(
      shouldResetClipboardCapturePauseGuideDismissed(
        createSettingsDraft({ clipboardCaptureEnabled: false }),
        createSettingsDraft({ clipboardCaptureEnabled: false }),
      ),
    ).toBe(false);

    expect(
      shouldResetClipboardCapturePauseGuideDismissed(
        null,
        createSettingsDraft({ clipboardCaptureEnabled: true }),
      ),
    ).toBe(false);
  });
});
