import { Alert, Button, Checkbox, NativeSelect, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { errorMessage } from "../contracts";
import { compareLauncherVersions } from "../services/launcherVersions";
import { rootPreset, rootPresetName, ROOT_PRESETS, synchronizeRoot } from "./scenarios";
import type { RootPreset, SimulatedTv } from "./scenarios";

interface TvEditorProps {
  tv: SimulatedTv;
  onSave(tv: SimulatedTv): void;
}

export function TvEditor({ tv, onSave }: TvEditorProps) {
  const [draft, setDraft] = useState(() => structuredClone(tv));
  const [error, setError] = useState<string | null>(null);
  const profile = draft.profile;
  const details = profile.technical_details ?? {
    model_code: profile.model,
    tizen_version: null,
    architecture: null,
    platform: null,
    root_runtime_version: null,
  };
  function field(change: Partial<SimulatedTv["profile"]>) {
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...change } }));
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave(synchronizeRoot(draft));
          setError(null);
        } catch (error) {
          setError(errorMessage(error));
        }
      }}
    >
      <Stack gap="sm">
        <TextInput
          label="TV name"
          value={profile.name}
          onChange={(event) => field({ name: event.currentTarget.value })}
          required
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput
            label="IP address"
            value={profile.host}
            onChange={(event) => field({ host: event.currentTarget.value })}
            required
          />
          <TextInput
            label="Model"
            value={profile.model}
            onChange={(event) =>
              field({
                model: event.currentTarget.value,
                technical_details: { ...details, model_code: event.currentTarget.value },
              })
            }
            required
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput
            label="Tizen version"
            value={profile.technical_details?.tizen_version ?? ""}
            onChange={(event) =>
              field({
                technical_details: { ...details, tizen_version: event.currentTarget.value || null },
              })
            }
          />
          <TextInput
            label="Installed launcher version"
            description="Leave blank if not installed"
            value={profile.launcher_version ?? ""}
            onChange={(event) => field({ launcher_version: event.currentTarget.value || null })}
          />
        </SimpleGrid>
        <NativeSelect
          label="Root access"
          value={rootPresetName(draft.root)}
          data={Object.entries(ROOT_PRESETS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => {
            const root = rootPreset(event.currentTarget.value as RootPreset);
            setDraft((current) => synchronizeRoot({ ...current, root }));
          }}
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <NativeSelect
            label="Home routing"
            value={profile.home_routing_mode ?? ""}
            data={[
              { value: "", label: "Unavailable" },
              { value: "watcher", label: "Watcher" },
              { value: "native", label: "Native Home" },
              { value: "hold", label: "On hold" },
              { value: "blocked", label: "Blocked" },
            ]}
            onChange={(event) =>
              field({
                home_routing_mode:
                  (event.currentTarget.value as SimulatedTv["profile"]["home_routing_mode"]) || undefined,
              })
            }
          />
          <NativeSelect
            label="Home backup"
            value={profile.home_backup?.status ?? "missing"}
            data={[
              { value: "missing", label: "No backup" },
              { value: "saved", label: "Original backup saved" },
              { value: "unreadable", label: "Unreadable backup" },
            ]}
            onChange={(event) => {
              const status = event.currentTarget.value as "saved" | "missing" | "unreadable";
              field({
                home_backup:
                  status === "saved"
                    ? {
                        status,
                        captured_at:
                          profile.home_backup?.status === "saved"
                            ? profile.home_backup.captured_at
                            : new Date().toISOString(),
                      }
                    : { status },
              });
            }}
          />
        </SimpleGrid>
        {draft.root.root_available && (
          <TextInput
            label="Installed root access version"
            value={draft.root.runtime_version ?? ""}
            onChange={(event) => {
              const runtime_version = event.currentTarget.value || null;
              setDraft((current) => ({
                ...current,
                root: {
                  ...current.root,
                  runtime_version,
                  update_available:
                    !current.root.update_pending &&
                    (compareLauncherVersions(runtime_version ?? "", current.root.target_runtime_version) ?? 0) < 0,
                },
              }));
            }}
          />
        )}
        <Checkbox
          label="TV is online"
          checked={draft.online}
          onChange={(event) => {
            const online = event.currentTarget.checked;
            setDraft((current) => ({ ...current, online }));
          }}
        />
        <Checkbox
          label="Show in saved TVs"
          checked={draft.saved}
          onChange={(event) => {
            const saved = event.currentTarget.checked;
            setDraft((current) => ({ ...current, saved }));
          }}
        />
        <Checkbox
          label="Find in network search"
          checked={draft.discoverable}
          onChange={(event) => {
            const discoverable = event.currentTarget.checked;
            setDraft((current) => ({ ...current, discoverable }));
          }}
        />
        <Checkbox
          label="Signing certificates available"
          checked={profile.launcher_signing_ready}
          onChange={(event) => field({ launcher_signing_ready: event.currentTarget.checked })}
        />
        <Checkbox
          label="Developer Mode is on"
          checked={profile.developer_mode === "1"}
          onChange={(event) => field({ developer_mode: event.currentTarget.checked ? "1" : "0" })}
        />
        <Text size="xs" c="dimmed">
          Use Scenario JSON to edit app lists, protected labels, removal refusals, button assignments, Home mappings and
          release notes.
        </Text>
        {error && (
          <Alert role="alert" color="red">
            {error}
          </Alert>
        )}
        <Button type="submit">Save and reload preview</Button>
      </Stack>
    </form>
  );
}
