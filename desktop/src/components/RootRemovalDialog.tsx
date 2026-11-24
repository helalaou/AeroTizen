import { Alert, Button, Checkbox, Code, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { RootAccessStatus, RootRemoveAction, SavedTv } from "../contracts";

interface RootRemovalDialogProps {
  profile: SavedTv;
  status: RootAccessStatus;
  remove(action: RootRemoveAction, reportError: (message: string) => void): Promise<RootAccessStatus | null>;
  simulateRestart?(reportError: (message: string) => void): Promise<void>;
  onClose(): void;
}

export function RootRemovalDialog({ profile, status, remove, simulateRestart, onClose }: RootRemovalDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = status.phase === "removed";
  const prepared = status.phase === "removing" && status.removal_prepared;
  const canRun = prepared || confirmed;

  async function apply() {
    if (pending || complete || !canRun) return;
    setPending(true);
    setError(null);
    try {
      await remove(prepared ? "finish" : "start", setError);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      opened
      centered
      title="Remove root"
      size="lg"
      onClose={onClose}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <Stack gap="md" aria-busy={pending}>
        <Text size="sm">
          TV: <strong>{profile.name}</strong>
        </Text>
        {complete && (
          <Alert color="green" role="status">
            The TV confirmed that root access was removed.
          </Alert>
        )}
        {!complete && !prepared && (
          <>
            <Alert color="red" title="Remove root access from this TV?">
              Remote button remaps and Stremio titles in Continue Watching will stop working. AeroTizen will stay
              installed.
            </Alert>
            <Checkbox
              label="Confirm removal from this TV"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
          </>
        )}
        {prepared && (
          <>
            <Alert color="orange" title="Restart the TV to finish removal">
              Automatic startup for root access is disabled. Removal progress is saved on this computer.
            </Alert>
            <Text size="sm">
              On the TV, open Developer Mode. Set <strong>Host PC IP</strong> to{" "}
              {profile.computer_ip ? <Code>{profile.computer_ip}</Code> : "this computer’s local IP address"}. Save the
              settings, restart the TV, then select <strong>Finish removal</strong>.
            </Text>
            {simulateRestart && (
              <Button
                variant="subtle"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError(null);
                  try {
                    await simulateRestart(setError);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Demo: restart TV
              </Button>
            )}
          </>
        )}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={pending} onClick={onClose}>
            {complete ? "Done" : "Close"}
          </Button>
          {!complete && (
            <Button color="red" loading={pending} disabled={!canRun} onClick={() => void apply()}>
              {prepared ? "Finish removal" : "Remove root"}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
