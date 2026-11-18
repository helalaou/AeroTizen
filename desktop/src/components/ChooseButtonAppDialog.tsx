import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { ButtonChange, ButtonTargetApp, TvButtonMapping } from "../contracts";

interface ChooseButtonAppDialogProps {
  mapping: TvButtonMapping;
  apps: ButtonTargetApp[] | null;
  loading: boolean;
  error: string | null;
  onSave(change: ButtonChange, reportError: (message: string) => void): Promise<boolean>;
  onClose(): void;
}

export function ChooseButtonAppDialog({ mapping, apps, loading, error, onSave, onClose }: ChooseButtonAppDialogProps) {
  const [appId, setAppId] = useState(mapping.app_id);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const targets = apps ?? [];
  const counts = new Map<string, number>();
  for (const { name } of targets) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
  const options = targets.map(({ id, name }) => ({
    value: id,
    label: (counts.get(name.toLowerCase()) ?? 0) > 1 ? `${name} (${id})` : name,
  }));
  const changed = appId !== null && appId !== mapping.app_id && targets.some(({ id }) => id === appId);

  async function save() {
    if (!changed || saving) return;
    setSaving(true);
    setSaveError(null);
    if (await onSave({ button: mapping.button, mode: "app", app_id: appId }, setSaveError)) onClose();
    else setSaving(false);
  }

  return (
    <Modal
      opened
      centered
      title={`Choose an app for ${mapping.button}`}
      onClose={onClose}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md" aria-busy={loading || saving}>
        <Select
          data-autofocus
          label="Installed app"
          placeholder={loading ? "Loading installed apps…" : "Search installed apps"}
          searchable
          floatingHeight="viewport"
          limit={40}
          allowDeselect={false}
          nothingFoundMessage="No matching apps"
          data={options}
          value={appId}
          onChange={setAppId}
          disabled={loading || saving || options.length === 0}
        />
        {apps?.length === 0 && (
          <Text size="sm" c="dimmed">
            No installed apps are available.
          </Text>
        )}
        {(error || saveError) && (
          <Alert role="alert" color="red">
            {error ?? saveError}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!changed} loading={saving} onClick={() => void save()}>
            Assign app
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
