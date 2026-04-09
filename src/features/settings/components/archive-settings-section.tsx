import { FolderOpen, FolderSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import { useScopedT } from "@/i18n";
import type { SettingsDraft } from "@/types/shell";

export function ArchiveSettingsSection({
  onPickKnowledgeRoot,
  onRevealKnowledgeRoot,
  settingsDraft,
}: {
  onPickKnowledgeRoot: () => Promise<void>;
  onRevealKnowledgeRoot: () => Promise<void>;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections.find((item) => item.id === "archive") ?? settingsSections[0];
  const t = useScopedT("settings");

  return (
    <SettingsSection
      section={section}
      badge={settingsDraft.knowledgeRoot ? t("badges.configured") : t("badges.needsAttention")}
    >
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            htmlFor="knowledge-root"
            label={t("archive.root.label")}
            info={t("archive.root.info")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="knowledge-root"
                value={settingsDraft.knowledgeRoot}
                readOnly
                aria-readonly="true"
                placeholder={t("archive.root.placeholder")}
                className="min-w-[260px] flex-1 cursor-default select-text"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void onPickKnowledgeRoot()}>
                <FolderSearch />
                {t("archive.root.pick")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!settingsDraft.knowledgeRoot}
                onClick={() => void onRevealKnowledgeRoot()}
              >
                <FolderOpen />
                {t("archive.root.reveal")}
              </Button>
            </div>
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
