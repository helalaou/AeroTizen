import { Alert, Button, Checkbox, Code, Group, List, Modal, Stack, Stepper, Text } from "@mantine/core";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import type { RootAccessStatus, RootUpdateAction, SavedTv } from "../contracts";
import { showToast } from "../Toasts";
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  let activeStep = pending ? 1 : 0;
  if (status.update_pending) activeStep = 2;
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
      !result.update_pending &&
      result.root_available &&
      result.setup_complete &&
      result.runtime_version === result.target_runtime_version;
    if (verified) {
      onClose();
      showToast(`Root access updated to ${result.target_runtime_version} on ${profile.name}.`);
      return;
    }
    if (!result.update_pending)
      setError("The TV did not confirm the new version. Check saved progress to refresh Root access.");
    if (resuming) setNotice("The update is not verified yet. Complete the restart steps, then check again.");
  }

  return (
    <Modal
      opened
      centered
      size="lg"
      title="Update root access"
      onClose={onClose}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <Stack gap="md" aria-busy={pending}>
        <Text size="sm">
          TV: <strong>{profile.name}</strong>
        </Text>
        <Stepper active={activeStep} size="xs" allowNextStepsSelect={false}>
          <Stepper.Step label="Prepare" />
          <Stepper.Step label="Update" />
          <Stepper.Step label="Restart" />
        </Stepper>
        {status.update_pending && (
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
        {!status.update_pending && !pending && (
          <>
            <Text>
              Update from version {status.runtime_version ?? "Unavailable"} to{" "}
              <strong>{status.target_runtime_version}</strong>.
            </Text>
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Before you update
              </Text>
              <List type="ordered" spacing="xs" size="sm">
                <List.Item>Use the computer with the original signing certificates.</List.Item>
                <List.Item>
                  Keep Developer Mode on and Host PC IP set to <Code>127.0.0.1</Code>.
                </List.Item>
              </List>
            </Stack>
            <Text size="sm">You’ll restart the TV to finish the update.</Text>
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
            Updating root access. Keep this app open and the TV on.
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
            Close
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
          <Button
            loading={pending}
            disabled={!status.update_pending && (!confirmed || !status.update_available)}
            onClick={() => void apply()}
          >
            {status.update_pending ? resumeLabel : "Install update"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
