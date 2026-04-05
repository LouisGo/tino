import type { LucideIcon } from "lucide-react";
import { FileSearch, Pause, Play, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SettingsIconButton } from "@/features/settings/components/settings-icon-button";
import {
  SettingsPanel,
  SettingsPanelBody,
} from "@/features/settings/components/settings-panel";
import { SettingField } from "@/features/settings/components/setting-field";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { settingsSections } from "@/features/settings/settings-sections";

export function AutomationSettingsSection({
  autostartEnabled,
  captureEnabled,
  onOpenLogs,
  onToggleAutostart,
  onToggleCapture,
  toggleAutostartPending,
}: {
  autostartEnabled: boolean;
  captureEnabled: boolean;
  onOpenLogs: () => Promise<void>;
  onToggleAutostart: () => Promise<void>;
  onToggleCapture: () => void;
  toggleAutostartPending: boolean;
}) {
  const section = settingsSections[3];

  return (
    <SettingsSection section={section} badge="Live controls">
      <SettingsPanel>
        <SettingsPanelBody>
          <AutomationRow
            title="Capture pipeline"
            description="Pause or resume clipboard capture."
            status={captureEnabled ? "Running" : "Paused"}
            statusVariant={captureEnabled ? "success" : "secondary"}
            icon={captureEnabled ? Pause : Play}
            actionLabel={captureEnabled ? "Pause capture" : "Resume capture"}
            onAction={onToggleCapture}
          />
          <AutomationRow
            title="Launch at login"
            description="Control app launch on sign-in."
            status={autostartEnabled ? "Enabled" : "Disabled"}
            statusVariant={autostartEnabled ? "success" : "secondary"}
            icon={Power}
            actionLabel={toggleAutostartPending ? "Updating autostart" : "Toggle autostart"}
            disabled={toggleAutostartPending}
            onAction={() => void onToggleAutostart()}
          />
          <AutomationRow
            title="Logs"
            description="Open the runtime log directory."
            status="Available"
            statusVariant="outline"
            icon={FileSearch}
            actionLabel="Open logs"
            onAction={() => void onOpenLogs()}
          />
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}

function AutomationRow({
  actionLabel,
  description,
  disabled,
  icon: Icon,
  onAction,
  status,
  statusVariant,
  title,
}: {
  actionLabel: string;
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  onAction: () => void;
  status: string;
  statusVariant: "outline" | "secondary" | "success";
  title: string;
}) {
  return (
    <SettingField
      label={title}
      description={description}
      action={<Badge variant={statusVariant}>{status}</Badge>}
    >
      <div className="flex justify-end">
        <SettingsIconButton
          label={actionLabel}
          disabled={disabled}
          onClick={onAction}
        >
          <Icon className="size-4" />
        </SettingsIconButton>
      </div>
    </SettingField>
  );
}
