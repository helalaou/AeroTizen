import { Alert, Button, Checkbox, Code, Group, List, Modal, Stack, Stepper, Text } from "@mantine/core";
import { Check, RotateCw } from "lucide-react";
import { useState } from "react";
import type { RootAccessStatus, RootSetupAction, SavedTv } from "../contracts";
import { ROOT_POWER_OFF_SECONDS, rootSetupStage } from "../services/rootAccess";
import { SamsungSignInDialog } from "./SamsungSignInDialog";

interface RootSetupDialogProps {
  profile: SavedTv;
  status: RootAccessStatus;
  signedIn: boolean;
  signIn(signal: AbortSignal): Promise<unknown>;
  prepareCertificates(reportError: (message: string) => void): Promise<boolean>;
  setup(action: RootSetupAction, reportError: (message: string) => void): Promise<RootAccessStatus | null>;
  simulateRestart?(reportError: (message: string) => void): Promise<void>;
  onRefresh(): void;
  onClose(): void;
}

const SETUP_STEP = { prepare: 0, restart: 2, complete: 3, blocked: 0, unavailable: 0 };

export function RootSetupDialog({
  profile,
  status,
  signedIn,
  signIn,
  prepareCertificates,
  setup,
  simulateRestart,
  onRefresh,
  onClose,
}: RootSetupDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<RootSetupAction | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const stage = rootSetupStage(status);
  const activeStep = pending === "start" ? 1 : SETUP_STEP[stage];

  async function apply(action: RootSetupAction, reportError: (message: string) => void) {
    if (pending || (action === "start" && !confirmed)) return false;
    setPending(action);
    setError(null);
    setNotice(null);
    const result = await setup(action, (message) => {
      setError(message);
      reportError(message);
    });
    setPending(null);
    if (action === "verify" && result && !result.setup_complete)
      setNotice("The TV has not confirmed automatic root access yet. Check the restart steps, then try again.");
    return result !== null;
  }

  function start() {
    if (!confirmed || pending) return;
    if (!profile.launcher_signing_ready) setSigning(true);
    else void apply("start", setError);
  }

  if (signing)
    return (
      <SamsungSignInDialog
        signedIn={signedIn}
        tvName={profile.name}
        setupRoot
        signIn={signIn}
        prepareCertificates={prepareCertificates}
        install={(reportError) => apply("start", reportError)}
        onComplete={() => setSigning(false)}
      />
    );

  return (
    <Modal
      opened
      centered
      size="lg"
      title="Set up root access"
      onClose={onClose}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <Stack gap="md" aria-busy={Boolean(pending)}>
        <Text size="sm">
          TV: <strong>{profile.name}</strong>
        </Text>
        <Stepper active={activeStep} size="xs" allowNextStepsSelect={false}>
          <Stepper.Step label="Prepare" />
          <Stepper.Step label="Install" />
          <Stepper.Step label="Restart" />
        </Stepper>
        {pending === "start" && (
          <Text size="sm" role="status">
            Setting up root access. Keep the TV on and this app open.
          </Text>
        )}
        {pending !== "start" && stage === "prepare" && (
          <>
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Turn on Developer Mode
              </Text>
              <List type="ordered" spacing="xs" size="sm">
                <List.Item>
                  On your TV, open <strong>Apps</strong> in Smart Hub and go to <strong>App Settings</strong>.
                </List.Item>
                <List.Item>
                  Enter <Code>12345</Code> with your remote or the on-screen keypad.
                </List.Item>
                <List.Item>Turn on Developer Mode.</List.Item>
                <List.Item>
                  In <strong>Host PC IP</strong>, enter{" "}
                  {profile.computer_ip ? <Code>{profile.computer_ip}</Code> : "this computer’s local IP address"}.
                  Select <strong>OK</strong>, then restart the TV.
                </List.Item>
              </List>
            </Stack>
            <Text size="sm">Setup saves a private recovery record on this computer.</Text>
            {!profile.launcher_signing_ready && (
              <Text size="sm">Samsung sign-in and certificate setup will open first.</Text>
            )}
            <Checkbox
              label="I’ve completed Developer Mode setup on the TV"
              checked={confirmed}
              disabled={Boolean(pending)}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
          </>
        )}
        {pending !== "start" && stage === "restart" && (
          <>
            <Alert color="orange" title="Restart the TV to finish setup">
              Your progress is saved. Root setup is complete only after the restart has been verified.
            </Alert>
            <List type="ordered" spacing="sm" size="sm">
              <List.Item>
                On the TV, leave Developer Mode on and set Host PC IP to <Code>127.0.0.1</Code>.
              </List.Item>
              <List.Item>
                Disconnect power from the TV or One Connect box for {ROOT_POWER_OFF_SECONDS} seconds.
              </List.Item>
              <List.Item>
                Reconnect power, turn the TV on and select <strong>Check after restart</strong>.
              </List.Item>
            </List>
            {simulateRestart && (
              <Button
                variant="subtle"
                leftSection={<RotateCw size={16} />}
                disabled={Boolean(pending)}
                onClick={async () => {
                  setPending("demo");
                  setError(null);
                  setNotice(null);
                  await simulateRestart(setError);
                  setPending(null);
                }}
              >
                Demo: restart TV
              </Button>
            )}
          </>
        )}
        {pending !== "start" && stage === "complete" && (
          <Alert color="green" icon={<Check size={18} />} role="status">
            Root access and automatic startup are verified on {profile.name}.
          </Alert>
        )}
        {pending !== "start" && (stage === "blocked" || stage === "unavailable") && (
          <Text size="sm">Refresh Root access to check the current setup state.</Text>
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
          <Button variant="default" disabled={Boolean(pending)} onClick={onClose}>
            {stage === "complete" ? "Done" : "Close"}
          </Button>
          {error && (
            <Button
              variant="default"
              disabled={Boolean(pending)}
              onClick={() => {
                onClose();
                onRefresh();
              }}
            >
              Check saved progress
            </Button>
          )}
          {stage === "prepare" && (
            <Button disabled={!confirmed} loading={pending === "start"} onClick={start}>
              Start setup
            </Button>
          )}
          {stage === "restart" && (
            <Button
              disabled={pending === "demo"}
              loading={pending === "verify"}
              onClick={() => void apply("verify", setError)}
            >
              Check after restart
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
