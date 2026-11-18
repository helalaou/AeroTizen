import { Alert, Button, Checkbox, Code, Group, List, Modal, Stack, Text } from "@mantine/core";
import { Check, RotateCw } from "lucide-react";
import { useState } from "react";
import type { RootAccessStatus, RootUpdateAction, SavedTv } from "../contracts";
import { rootComputerAddress, ROOT_POWER_OFF_SECONDS } from "../services/rootAccess";

interface RootUpdateDialogProps {
  profile: SavedTv;
  status: RootAccessStatus;
  upgrade(action: RootUpdateAction, reportError: (message: string) => void): Promise<RootAccessStatus | null>;
  simulateRestart?(reportError: (message: string) => void): Promise<void>;
  onRefresh(): void;
  onClose(): void;
}

export function RootUpdateDialog({
  profile,
  status,
  upgrade,
  simulateRestart,
  onRefresh,
  onClose,
}: RootUpdateDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const computer = rootComputerAddress(profile, status);
  const resumeLabel = status.root_available ? "Check after restart" : "Resume update";

  async function apply() {
    if (pending || (!status.update_pending && !confirmed)) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const resuming = status.update_pending;
    const result = await upgrade(resuming ? "resume" : "start", setError);
    setPending(false);
    if (!result) return;
    const verified =
      !result.update_pending && result.setup_complete && result.runtime_version === result.target_runtime_version;
    setComplete(verified);
    if (!verified && !result.update_pending)
      setError("The TV did not confirm the helper version. Check saved progress to refresh Root access.");
    if (resuming && !verified)
      setNotice("The update is not verified yet. Complete the restart steps, then check again.");
  }

  return (
    <Modal
      opened
      centered
      size="lg"
      title="Update root helper"
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
          <Alert color="green" icon={<Check size={18} />} role="status">
            Root helper {status.runtime_version} and automatic startup are verified on {profile.name}.
          </Alert>
        )}
        {!complete && status.update_pending && (
          <>
            <Alert color="orange" title="Restart the TV to finish the update">
              Progress is saved on this computer. Keep using this app build to finish the update.
            </Alert>
            <List type="ordered" spacing="sm" size="sm">
              <List.Item>
                Leave Developer Mode on and set Host PC IP to <Code>127.0.0.1</Code>.
              </List.Item>
              <List.Item>
                Disconnect power from the TV or One Connect box for {ROOT_POWER_OFF_SECONDS} seconds.
              </List.Item>
              <List.Item>
                Reconnect power, turn the TV on and select <strong>Check after restart</strong>.
              </List.Item>
            </List>
            {!status.root_available && (
              <Alert color="blue" title="If the update was interrupted">
                If root access does not return, temporarily set Host PC IP to{" "}
                {computer ? <Code>{computer}</Code> : "this computer's IP address"} and restart the TV. Select Resume
                update to repair startup, then follow the steps above to return Host PC IP to 127.0.0.1 and restart
                again.
              </Alert>
            )}
            {simulateRestart && (
              <Button
                variant="subtle"
                leftSection={<RotateCw size={16} />}
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError(null);
                  setNotice(null);
                  await simulateRestart(setError);
                  setPending(false);
                }}
              >
                Demo: restart TV
              </Button>
            )}
          </>
        )}
        {!complete && !status.update_pending && (
          <>
            <Text>
              Update the root helper from {status.runtime_version ?? "Unavailable"} to{" "}
              <strong>{status.target_runtime_version}</strong>.
            </Text>
            <Text size="sm">
              This version is included with AeroTizen Desktop. The update keeps your pairing, Home settings and startup
              settings.
            </Text>
            <Text size="sm">
              Use the original signing certificates on this computer. Keep Developer Mode on and Host PC IP set to{" "}
              <Code>127.0.0.1</Code>. You must restart the TV to finish.
            </Text>
            <Checkbox
              label="I am ready to update and restart this TV"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
          </>
        )}
        {pending && (
          <Text size="sm" role="status">
            Updating and checking the helper. Keep this app open and the TV on.
          </Text>
        )}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert color="orange" role="status">
            {notice}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={pending} onClick={onClose}>
            {complete ? "Done" : "Close"}
          </Button>
          {error && (
            <Button
              variant="default"
              disabled={pending}
              onClick={() => {
                onClose();
                onRefresh();
              }}
            >
              Check saved progress
            </Button>
          )}
          {!complete && (
            <Button
              loading={pending}
              disabled={!status.update_pending && (!confirmed || !status.update_available)}
              onClick={() => void apply()}
            >
              {status.update_pending ? resumeLabel : "Update helper"}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
