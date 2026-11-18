import { Alert, Button, Code, Divider, Group, Modal, NativeSelect, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import type { LauncherRelease, SavedTv } from "../contracts";
import { compareLauncherVersions } from "../services/launcherVersions";
import styles from "../styles.module.css";
import { LauncherReleaseNotes } from "./LauncherReleaseNotes";

interface LauncherPanelProps {
  profile: SavedTv;
  releases: LauncherRelease[] | null | undefined;
  busy: boolean;
  canInstall: boolean;
  onInstall(version: string, confirmReplace: boolean): Promise<boolean>;
  onRetryVersions(): void;
  canSetupSigning?: boolean;
}

function releaseLabel(releases: LauncherPanelProps["releases"]) {
  if (releases?.[0]) return `Latest version: ${releases[0].version}`;
  if (releases === undefined) return "Checking for releases…";
  if (releases === null) return "Could not load launcher versions.";
  return "No installable launcher releases found.";
}

function installLabel(target: string, installed: string | null, comparison: number | null) {
  if (target === installed) return "Already installed";
  if (!installed) return `Install ${target}`;
  if (comparison === null) return `Replace with ${target}`;
  if (comparison < 0) return `Downgrade to ${target}`;
  return `Update to ${target}`;
}

export function LauncherPanel({
  profile,
  releases,
  busy,
  canInstall,
  onInstall,
  onRetryVersions,
  canSetupSigning,
}: LauncherPanelProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const installed = profile.launcher_version;
  const latest = releases?.[0];
  const selectedRelease = (showVersions ? releases?.find(({ version }) => version === choice) : undefined) ?? latest;
  const target = selectedRelease?.version;
  const comparison = installed && target ? compareLauncherVersions(target, installed) : null;
  const needsConfirmation = installed !== null && (comparison === null || comparison < 0);
  const ready = Boolean(target && (profile.launcher_signing_ready || canSetupSigning) && target !== installed);
  const action = target ? installLabel(target, installed, comparison) : null;

  async function install(confirmed: boolean) {
    if (!target || !ready) return;
    setConfirm(false);
    setVerified(null);
    if (await onInstall(target, confirmed)) setVerified(target);
  }

  return (
    <div className={styles.detailContent}>
      <Stack gap="lg">
        <Title order={1}>Launcher</Title>
        <Paper withBorder p="lg">
          <Stack gap="md">
            <div>
              <Text fw={600}>{installed ? `Installed version: ${installed}` : "AeroTizen is not installed"}</Text>
              <Text size="sm" c="dimmed">
                {releaseLabel(releases)}
              </Text>
            </div>
            {!profile.launcher_signing_ready && (
              <Alert color="orange" title="Signing certificates required">
                {canSetupSigning ? (
                  "The app will help you sign in to Samsung and set up this TV before installing AeroTizen."
                ) : (
                  <>
                    Use the signing profile for this TV. If this is your first install, run{" "}
                    <Code>{`aerotizen --tv ${profile.host} certs`}</Code>, then refresh the TV.
                  </>
                )}
                {installed && " For an existing installation, use its original signing profile."}
              </Alert>
            )}
            {target && (
              <>
                {showVersions && (
                  <NativeSelect
                    label="Launcher version"
                    value={target}
                    onChange={(event) => setChoice(event.currentTarget.value)}
                    disabled={busy}
                    data={releases?.map(({ version: value }) => {
                      const labels = [value === latest?.version && "latest", value === installed && "installed"].filter(
                        Boolean,
                      );
                      return { value, label: labels.length ? `${value} (${labels.join(", ")})` : value };
                    })}
                  />
                )}
                <Group>
                  <Button
                    disabled={!canInstall || !ready}
                    onClick={() => (needsConfirmation ? setConfirm(true) : void install(false))}
                  >
                    {action}
                  </Button>
                  <Button variant="default" disabled={busy} onClick={() => setShowVersions((current) => !current)}>
                    {showVersions ? "Use latest version" : "Choose another version"}
                  </Button>
                </Group>
              </>
            )}
            {releases === null && (
              <Group>
                <Button variant="default" onClick={onRetryVersions}>
                  Retry
                </Button>
              </Group>
            )}
            {verified && installed === verified && (
              <Alert color="green" role="status">
                AeroTizen {verified} installed and verified.
              </Alert>
            )}
            {selectedRelease && (
              <>
                <Divider />
                <LauncherReleaseNotes key={selectedRelease.version} release={selectedRelease} />
              </>
            )}
          </Stack>
        </Paper>
      </Stack>
      {confirm && (
        <Modal opened centered title={action} onClose={() => setConfirm(false)}>
          <Stack>
            <Text>
              Replace {installed} with {target}? Older versions may lack fixes and may fail to read settings saved by a
              newer version. Some TVs reject downgrades.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button color="red" onClick={() => void install(true)}>
                {action}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </div>
  );
}
