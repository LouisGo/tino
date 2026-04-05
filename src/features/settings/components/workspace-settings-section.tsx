import { FolderOpen, FolderSearch } from "lucide-react";

import { Input } from "@/components/ui/input";
import { SettingsIconButton } from "@/features/settings/components/settings-icon-button";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import type { SettingsDraft } from "@/types/shell";

const clipboardRetentionOptions = [
  {
    value: 1,
    label: "1 day",
    description: "Tight",
  },
  {
    value: 3,
    label: "3 days",
    description: "Balanced",
  },
  {
    value: 7,
    label: "7 days",
    description: "Extended",
  },
  {
    value: 14,
    label: "14 days",
    description: "Maximum",
  },
] as const;

export function WorkspaceSettingsSection({
  onPickKnowledgeRoot,
  onRevealKnowledgeRoot,
  patchSettingsDraft,
  settingsDraft,
}: {
  onPickKnowledgeRoot: () => Promise<void>;
  onRevealKnowledgeRoot: () => Promise<void>;
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections[0];

  return (
    <SettingsSection
      section={section}
      badge={settingsDraft.knowledgeRoot ? "Configured" : "Needs attention"}
    >
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            htmlFor="knowledge-root"
            label="Knowledge root"
            description="Archive folder."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="knowledge-root"
                value={settingsDraft.knowledgeRoot}
                onChange={(event) =>
                  patchSettingsDraft({ knowledgeRoot: event.target.value })
                }
                placeholder="~/tino-inbox"
                className="min-w-[260px] flex-1"
              />
              <SettingsIconButton
                label="Pick folder"
                onClick={() => void onPickKnowledgeRoot()}
              >
                <FolderSearch />
              </SettingsIconButton>
              <SettingsIconButton
                label="Reveal folder"
                disabled={!settingsDraft.knowledgeRoot}
                onClick={() => void onRevealKnowledgeRoot()}
              >
                <FolderOpen />
              </SettingsIconButton>
            </div>
          </SettingField>

          <SettingField
            label="Clipboard retention"
            description="Keep recent captures available."
          >
            <div className="flex flex-wrap gap-2">
              {clipboardRetentionOptions.map((option) => {
                const active = settingsDraft.clipboardHistoryDays === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      patchSettingsDraft({ clipboardHistoryDays: option.value })
                    }
                    className={`min-w-[104px] flex-1 basis-[112px] rounded-[18px] border px-3 py-3 text-left transition ${
                      active
                        ? "border-primary/30 bg-primary/10 shadow-sm"
                        : "border-border/80 bg-surface-elevated hover:border-primary/20 hover:bg-secondary/70"
                    }`}
                    aria-pressed={active}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
