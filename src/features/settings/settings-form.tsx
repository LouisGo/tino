import { useEffect, useRef } from "react";

import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderSearch, Rocket, Save, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAppSettings,
  getAutostartEnabled,
  pickDirectory,
  revealPath,
  saveAppSettings,
  setAutostartEnabled,
} from "@/lib/tauri";
import { useAppShellStore } from "@/stores/app-shell-store";

export function SettingsForm() {
  const queryClient = useQueryClient();
  const settingsDraft = useAppShellStore((state) => state.settingsDraft);
  const patchSettingsDraft = useAppShellStore((state) => state.patchSettingsDraft);
  const setSettingsDraft = useAppShellStore((state) => state.setSettingsDraft);
  const hydrated = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
  });

  const { data: autostartEnabled } = useQuery({
    queryKey: ["autostart-enabled"],
    queryFn: getAutostartEnabled,
  });

  const form = useForm({
    defaultValues: settingsDraft,
    onSubmit: async ({ value }) => {
      const saved = await saveAppSettings(value);
      setSettingsDraft(saved);
      form.reset(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot"] }),
      ]);
    },
  });

  useEffect(() => {
    if (!settings || hydrated.current) {
      return;
    }

    hydrated.current = true;
    setSettingsDraft(settings);
    form.reset(settings);
  }, [form, setSettingsDraft, settings]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Runtime Setup</CardTitle>
          <CardDescription>
            Knowledge root and provider settings now persist through Rust into app
            data, while archive writes continue to stay inside the knowledge root.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="knowledgeRoot"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Knowledge Root</Label>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                        patchSettingsDraft({ knowledgeRoot: event.target.value });
                      }}
                      placeholder="~/tino-inbox"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={async () => {
                        const value = await pickDirectory(field.state.value);
                        if (!value) {
                          return;
                        }

                        field.handleChange(value);
                        patchSettingsDraft({ knowledgeRoot: value });
                      }}
                    >
                      <FolderSearch />
                      Pick
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => void revealPath(field.state.value)}
                    >
                      Reveal
                    </Button>
                  </div>
                </div>
              )}
            />

            <div className="grid gap-5 md:grid-cols-2">
              <form.Field
                name="baseUrl"
                children={(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Provider Base URL</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                        patchSettingsDraft({ baseUrl: event.target.value });
                      }}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                )}
              />

              <form.Field
                name="model"
                children={(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Model</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                        patchSettingsDraft({ model: event.target.value });
                      }}
                      placeholder="gpt-5.4-mini"
                    />
                  </div>
                )}
              />
            </div>

            <form.Field
              name="apiKey"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>API Key</Label>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      patchSettingsDraft({ apiKey: event.target.value });
                    }}
                    className="min-h-24 font-mono"
                    placeholder="Stored in app data, not in the knowledge root."
                  />
                </div>
              )}
            />

            <Button type="submit" className="rounded-full">
              <Save />
              Save Settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Autostart</CardTitle>
            <CardDescription>
              Wired to the Tauri autostart plugin for macOS launch agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant={autostartEnabled ? "success" : "secondary"}>
              {autostartEnabled ? "enabled" : "disabled"}
            </Badge>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await setAutostartEnabled(!(autostartEnabled ?? false));
                  await queryClient.invalidateQueries({
                    queryKey: ["autostart-enabled"],
                  });
                }}
              >
                <Rocket />
                Toggle
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scaffold Notes</CardTitle>
            <CardDescription>
              This route now drives the real settings bridge instead of a local-only
              draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Provider calls still stay in the frontend for later AI pipeline work.
            </p>
            <p>
              Rust now owns clipboard polling, `daily/*.md` archive writes, and
              `_system/runtime.json` snapshots.
            </p>
            <p className="flex items-center gap-2 text-foreground">
              <Sparkles className="size-4 text-primary" />
              Current milestone is the no-AI capture-to-daily loop, not the full
              orchestrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
