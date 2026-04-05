import { useEffect, useRef } from "react";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileSearch,
  FolderSearch,
  Moon,
  Palette,
  Rocket,
  Save,
  Sparkles,
  Sun,
} from "lucide-react";

import { queryKeys } from "@/app/query-keys";
import { filterConfigurableShortcutOverrides } from "@/app/shortcuts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ShortcutSettingsPanel } from "@/features/settings/shortcut-settings-panel";
import { themeModes, themeNames } from "@/lib/theme";
import {
  getAppSettings,
  getAutostartEnabled,
  getLogDirectory,
  pickDirectory,
  revealPath,
  saveAppSettings,
  setAutostartEnabled,
} from "@/lib/tauri";
import { useAppShellStore } from "@/stores/app-shell-store";
import { useThemeStore } from "@/stores/theme-store";
import type { SettingsDraft } from "@/types/shell";

export function SettingsForm() {
  const queryClient = useQueryClient();
  const captureEnabled = useAppShellStore((state) => state.captureEnabled);
  const setCaptureEnabled = useAppShellStore((state) => state.setCaptureEnabled);
  const settingsDraft = useAppShellStore((state) => state.settingsDraft);
  const patchSettingsDraft = useAppShellStore((state) => state.patchSettingsDraft);
  const setSettingsDraft = useAppShellStore((state) => state.setSettingsDraft);
  const mode = useThemeStore((state) => state.mode);
  const themeName = useThemeStore((state) => state.themeName);
  const setMode = useThemeStore((state) => state.setMode);
  const setThemeName = useThemeStore((state) => state.setThemeName);
  const toggleDarkLight = useThemeStore((state) => state.toggleDarkLight);
  const hydrated = useRef(false);

  const { data: settings } = useQuery({
    queryKey: queryKeys.appSettings(),
    queryFn: getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

  const { data: autostartEnabled } = useQuery({
    queryKey: queryKeys.autostartEnabled(),
    queryFn: getAutostartEnabled,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

  const form = useForm({
    defaultValues: settingsDraft,
    onSubmit: async ({ value }) => {
      await saveSettingsMutation.mutateAsync({
        ...value,
        shortcutOverrides: filterConfigurableShortcutOverrides(value.shortcutOverrides),
      });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: saveAppSettings,
    onSuccess: async (saved) => {
      queryClient.setQueryData(queryKeys.appSettings(), saved);
      setSettingsDraft(saved);
      form.reset(saved);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageBase() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageSummary() }),
      ]);
    },
  });

  const toggleAutostartMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await setAutostartEnabled(enabled);
      return enabled;
    },
    onMutate: async (nextEnabled) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.autostartEnabled() });
      const previousEnabled = queryClient.getQueryData<boolean>(
        queryKeys.autostartEnabled(),
      );

      queryClient.setQueryData(queryKeys.autostartEnabled(), nextEnabled);
      return { previousEnabled };
    },
    onError: (_error, _nextEnabled, context) => {
      queryClient.setQueryData(
        queryKeys.autostartEnabled(),
        context?.previousEnabled,
      );
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(queryKeys.autostartEnabled(), enabled);
    },
  });

  useEffect(() => {
    if (!settings || hydrated.current) {
      return;
    }

    hydrated.current = true;
    const sanitizedSettings = {
      ...settings,
      shortcutOverrides: filterConfigurableShortcutOverrides(settings.shortcutOverrides),
    };
    setSettingsDraft(sanitizedSettings);
    form.reset(sanitizedSettings);
  }, [form, setSettingsDraft, settings]);

  const handleShortcutOverridesChange = (
    shortcutOverrides: SettingsDraft["shortcutOverrides"],
  ) => {
    const sanitizedShortcutOverrides = filterConfigurableShortcutOverrides(shortcutOverrides);
    form.setFieldValue("shortcutOverrides", sanitizedShortcutOverrides);
    patchSettingsDraft({ shortcutOverrides: sanitizedShortcutOverrides });
  };

  return (
    <div className="space-y-6">
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
                    {field.state.value ? (
                      <button
                        type="button"
                        onClick={() => void revealPath(field.state.value)}
                        className="block max-w-full truncate text-left text-sm text-primary transition hover:underline"
                      >
                        {field.state.value}
                      </button>
                    ) : null}
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
                name="clipboardHistoryDays"
                children={(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Clipboard History Window</Label>
                    <Select
                      value={String(field.state.value)}
                      onValueChange={(nextValue) => {
                        const value = Number(nextValue);
                        field.handleChange(value);
                        field.handleBlur();
                        patchSettingsDraft({ clipboardHistoryDays: value });
                      }}
                    >
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 3, 7, 14].map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            Keep last {value} {value === 1 ? "day" : "days"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Clipboard board and disk-backed clipboard archive are retained
                      inside this rolling window.
                    </p>
                  </div>
                )}
              />

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

              <Button
                type="submit"
                className="rounded-full"
                disabled={saveSettingsMutation.isPending}
              >
                <Save />
                {saveSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shell Controls</CardTitle>
              <CardDescription>
                Sidebar controls moved here to keep the main shell quieter and more
                stable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Capture Pipeline</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Clipboard watch stays alive. This only pauses content entering the
                      main pipeline.
                    </p>
                  </div>
                  <Badge variant={captureEnabled ? "success" : "secondary"}>
                    {captureEnabled ? "active" : "paused"}
                  </Badge>
                </div>
                <Button
                  className="w-full justify-between"
                  variant={captureEnabled ? "default" : "secondary"}
                  onClick={() => setCaptureEnabled(!captureEnabled)}
                >
                  {captureEnabled ? "Pause Capture" : "Resume Capture"}
                  <Rocket className="size-4" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Adjust the runtime mode and palette for the desktop shell.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={toggleDarkLight}
                >
                  Toggle Dark / Light
                  {mode === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </Button>
                <label className="block space-y-2">
                  <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    Mode
                  </span>
                  <Select
                    value={mode}
                    onValueChange={(value) => setMode(value as (typeof themeModes)[number])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {themeModes.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    Palette
                  </span>
                  <Select
                    value={themeName}
                    onValueChange={(value) =>
                      setThemeName(value as (typeof themeNames)[number])
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {themeNames.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Palette className="size-3.5" />
                  Token-driven theme variables
                </p>
              </div>
            </CardContent>
          </Card>

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
                  disabled={toggleAutostartMutation.isPending}
                  onClick={() => {
                    void toggleAutostartMutation.mutateAsync(!(autostartEnabled ?? false));
                  }}
                >
                  <Rocket />
                  {toggleAutostartMutation.isPending ? "Updating..." : "Toggle"}
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

          <Card>
            <CardHeader>
              <CardTitle>Logs</CardTitle>
              <CardDescription>
                Rust and renderer logs are persisted into the system log directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                <p>`rust.log` covers watcher, archive, queue, and command-side activity.</p>
                <p>`renderer.log` covers UI runtime, console output, and unhandled frontend errors.</p>
                <p>Retention policy: `10 MB` per file, keep recent `10` rotations, prune files older than `14 days`.</p>
              </div>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={async () => {
                  const path = await getLogDirectory();
                  await revealPath(path);
                }}
              >
                View Logs
                <FileSearch className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <ShortcutSettingsPanel
        overrides={settingsDraft.shortcutOverrides}
        onChange={handleShortcutOverridesChange}
      />
    </div>
  );
}
