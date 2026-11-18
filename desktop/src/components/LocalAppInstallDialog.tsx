import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { Check, FileUp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { LocalAppPackage, SavedTv } from "../contracts";
import { SamsungSignInDialog } from "./SamsungSignInDialog";

interface LocalAppInstallDialogProps {
  profile: SavedTv;
  signedIn: boolean;
  choose(reportError: (message: string) => void): Promise<LocalAppPackage | null>;
  install(app: LocalAppPackage, reportError: (message: string) => void): Promise<boolean>;
  signIn(signal: AbortSignal): Promise<unknown>;
  prepareCertificates(reportError: (message: string) => void): Promise<boolean>;
  onClose(): void;
}

export function LocalAppInstallDialog({
  profile,
  signedIn,
  choose,
  install,
  signIn,
  prepareCertificates,
  onClose,
}: LocalAppInstallDialogProps) {
  const [app, setApp] = useState<LocalAppPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [setup, setSetup] = useState(false);
  const [installed, setInstalled] = useState(false);

  async function chooseFile() {
    setPending(true);
    setError(null);
    setApp(null);
    setConfirmed(false);
    const picked = await choose(setError);
    if (picked) {
      setApp(picked);
      setConfirmed(false);
    }
    setPending(false);
  }

  async function installApp(reportError: (message: string) => void) {
    if (!app || (app.replacing && !confirmed)) return false;
    const success = await install(app, reportError);
    setInstalled(success);
    return success;
  }

  async function proceed() {
    if (!profile.launcher_signing_ready) {
      setSetup(true);
      return;
    }
    setPending(true);
    setError(null);
    await installApp(setError);
    setPending(false);
  }

  if (setup && app) {
    return (
      <SamsungSignInDialog
        signedIn={signedIn}
        tvName={profile.name}
        appName={app.name}
        signIn={signIn}
        prepareCertificates={prepareCertificates}
        install={installApp}
        onComplete={() => setSetup(false)}
      />
    );
  }

  return (
    <Modal
      opened
      centered
      title={installed ? "App installed" : "Install local app"}
      onClose={onClose}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <Stack gap="md" aria-busy={pending}>
        {installed && app ? (
          <Alert color="green" icon={<Check size={18} />} role="status">
            {app.name} {app.version} is installed on {profile.name}.
          </Alert>
        ) : (
          <>
            <Text size="sm">
              Choose a Tizen app (.wgt) to install on <strong>{profile.name}</strong>.
            </Text>
            <Button
              variant="default"
              leftSection={<FileUp size={17} aria-hidden="true" />}
              loading={pending && !app}
              disabled={pending}
              onClick={() => void chooseFile()}
            >
              {app ? "Choose another file" : "Choose .wgt file"}
            </Button>
            {app && (
              <Stack gap="xs">
                <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                  {app.name}
                </Text>
                <Text size="sm">Version: {app.version}</Text>
                <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                  {app.app_id}
                </Text>
                {app.replacing && (
                  <>
                    <Alert color="orange" icon={<TriangleAlert size={18} aria-hidden="true" />}>
                      This replaces the installed app{app.current_version ? ` (${app.current_version})` : ""}. Older
                      versions can be incompatible with saved settings. Updates require the original signing
                      certificate.
                    </Alert>
                    <Checkbox
                      label="Replace the installed app"
                      checked={confirmed}
                      disabled={pending}
                      onChange={(event) => setConfirmed(event.currentTarget.checked)}
                    />
                  </>
                )}
                {!profile.launcher_signing_ready && (
                  <Text size="sm" c="dimmed">
                    Samsung sign-in and certificate setup will open before installation.
                  </Text>
                )}
              </Stack>
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
            {installed ? "Done" : "Cancel"}
          </Button>
          {!installed && (
            <Button
              disabled={!app || (app.replacing && !confirmed)}
              loading={pending && Boolean(app)}
              onClick={() => void proceed()}
            >
              Install
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
