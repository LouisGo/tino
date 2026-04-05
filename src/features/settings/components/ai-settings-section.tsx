import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";
import type { SettingsDraft } from "@/types/shell";

export function AiSettingsSection({
  patchSettingsDraft,
  settingsDraft,
}: {
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
  settingsDraft: SettingsDraft;
}) {
  const section = settingsSections[1];

  return (
    <SettingsSection
      section={section}
      badge={settingsDraft.baseUrl && settingsDraft.model ? "Configured" : "Endpoint pending"}
    >
      <SettingsPanel>
        <SettingsPanelBody>
          <SettingField
            htmlFor="provider-base-url"
            label="Base URL"
            description="Provider endpoint."
          >
            <Input
              id="provider-base-url"
              value={settingsDraft.baseUrl}
              onChange={(event) =>
                patchSettingsDraft({ baseUrl: event.target.value })
              }
              placeholder="https://api.openai.com/v1"
            />
          </SettingField>

          <SettingField
            htmlFor="provider-model"
            label="Model"
            description="Model id."
          >
            <Input
              id="provider-model"
              value={settingsDraft.model}
              onChange={(event) => patchSettingsDraft({ model: event.target.value })}
              placeholder="gpt-5.4-mini"
            />
          </SettingField>

          <SettingField
            htmlFor="provider-api-key"
            label="API key"
            description="Stored with app settings."
            action={(
              <Badge variant="secondary" className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Private
              </Badge>
            )}
          >
            <Input
              id="provider-api-key"
              value={settingsDraft.apiKey}
              onChange={(event) => patchSettingsDraft({ apiKey: event.target.value })}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your provider key."
            />
          </SettingField>
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
