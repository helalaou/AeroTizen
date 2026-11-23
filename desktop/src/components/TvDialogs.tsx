import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { validHost } from "../contracts";
import type { SavedTv } from "../contracts";

export type TvDialog = { kind: "address"; profile?: SavedTv } | { kind: "rename" | "forget"; profile: SavedTv };
const DIALOG_LABELS = {
  address: { title: "Connect to a TV", action: "Connect" },
  rename: { title: "Rename TV", action: "Save name" },
  forget: { title: "Forget TV", action: "Forget TV" },
};

interface TvDialogsProps {
  dialog: TvDialog;
  busy: boolean;
  error: string | null;
  onClose(): void;
  onConnect(host: string, profileId?: string): Promise<boolean>;
  onRename(id: string, name: string): Promise<boolean>;
  onForget(id: string): Promise<boolean>;
}

export function TvDialogs({ dialog, busy, error, onClose, onConnect, onRename, onForget }: TvDialogsProps) {
  const [value, setValue] = useState(dialog.kind === "rename" ? dialog.profile.name : (dialog.profile?.host ?? ""));
  const [invalid, setInvalid] = useState<string | null>(null);
  const labels = DIALOG_LABELS[dialog.kind];
  async function submit() {
    if (dialog.kind === "address" && !validHost(value)) {
      setInvalid("Enter a valid IPv4 address, such as 192.168.1.20.");
      return;
    }
    if (dialog.kind === "rename" && (!value.trim() || value.trim().length > 80)) {
      setInvalid("Use a name with 1 to 80 characters.");
      return;
    }
    let success: boolean;
    if (dialog.kind === "address") success = await onConnect(value.trim(), dialog.profile?.id);
    else if (dialog.kind === "rename") success = await onRename(dialog.profile.id, value.trim());
    else success = await onForget(dialog.profile.id);
    if (success) onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={labels.title}
      centered
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          {dialog.kind === "forget" ? (
            <Text>
              Forget {dialog.profile.name} from this list? Certificates, backups and the TV itself will stay unchanged.
            </Text>
          ) : (
            <TextInput
              data-autofocus
              label={dialog.kind === "rename" ? "TV name" : "TV IP address"}
              description={dialog.kind === "address" ? "Find this in the TV’s network settings." : undefined}
              placeholder={dialog.kind === "address" ? "192.168.1.20" : undefined}
              value={value}
              onChange={(event) => {
                setValue(event.currentTarget.value);
                setInvalid(null);
              }}
              error={invalid}
              disabled={busy}
              maxLength={dialog.kind === "rename" ? 80 : 15}
            />
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} color={dialog.kind === "forget" ? "red" : undefined}>
              {labels.action}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
