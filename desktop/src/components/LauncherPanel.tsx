import {
  ActionIcon,
  Alert,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { MonitorCheck, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { LauncherRelease, SavedTv } from "../contracts";
import { compareLauncherVersions } from "../services/launcherVersions";
import styles from "../styles.module.css";
import { LauncherReleaseNotes } from "./LauncherReleaseNotes";

interface LauncherPanelProps {
  profile: SavedTv;
  releases: LauncherRelease[] | null | undefined;
  releasesLoading: boolean;
  busy: boolean;
  canInstall: boolean;
  onInstall(version: string, confirmReplace: boolean): void;
  onRemove(): void;
  onRetryVersions(): void;
  canSetupSigning?: boolean;
}

function releaseSummary(installed: string | null, releases: LauncherPanelProps["releases"], loading: boolean) {
  const latest = releases?.[0]?.version;
  const onTv = installed === null ? "AeroTizen is not installed." : `On this TV: ${installed}`;
  if (!latest) {
    if (releases === undefined || loading) return { title: "Checking for releases…", detail: onTv };
    if (releases === null) return { title: "Couldn’t check for updates", detail: onTv, tone: "error" };
    return { title: "No installable AeroTizen releases found", detail: onTv };
  }
  if (installed === null) {
    return { title: "AeroTizen is not installed", detail: `Latest version: ${latest}`, recommended: latest };
  }
  if (installed === latest) return { title: "AeroTizen is up to date", detail: onTv, tone: "current" };
  const comparison = compareLauncherVersions(latest, installed);
  if (comparison !== null && comparison > 0) {
    return { title: "An update is available", recommended: latest };
  }
  return {
    title: comparison !== null && comparison < 0 ? "Newer than the latest release" : "AeroTizen is installed",
    detail: `${onTv} · Latest version: ${latest}`,
  };
}

function installLabel(target: string, installed: string | null) {
  if (installed === null) return `Install ${target}`;
  const comparison = compareLauncherVersions(target, installed);
  if (comparison === null) return `Replace with ${target}`;
  if (comparison < 0) return `Downgrade to ${target}`;
  return `Update to ${target}`;
}

function ReleaseOption({
  version,
  latest,
  installed,
  selected,
  disabled,
  onSelect,
}: {
  version: string;
  latest: boolean;
  installed: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect(): void;
}) {
  const labels = [latest && "Latest release", installed && "Installed on this TV"].filter(Boolean);
  return (
    <Tooltip
      label={labels.join(" · ")}
      disabled={!labels.length}
      events={{ hover: true, focus: true, touch: true }}
      withArrow
    >
      <UnstyledButton
        className={styles.releaseOption}
        aria-label={[version, ...labels].join(", ")}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
      >
        <span>{version}</span>
        {labels.length > 0 && (
          <Group gap={6} wrap="nowrap" aria-hidden="true" className={styles.releaseMarkers}>
            {latest && <Sparkles size={16} className={styles.latestRelease} />}
            {installed && <MonitorCheck size={16} />}
          </Group>
        )}
      </UnstyledButton>
    </Tooltip>
  );
}

export function LauncherPanel({
  profile,
  releases,
  releasesLoading,
  busy,
  canInstall,
  onInstall,
  onRemove,
  onRetryVersions,
  canSetupSigning,
}: LauncherPanelProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const installed = profile.launcher_version;
  const latest = releases?.[0];
  const summary = releaseSummary(installed, releases, releasesLoading);
  const recommended = summary.recommended;
  const selectedRelease = releases?.find(({ version }) => version === choice) ?? latest;
  const alternative =
    selectedRelease && selectedRelease.version !== installed && selectedRelease.version !== recommended;
  const installDisabled = !canInstall || releasesLoading || !(profile.launcher_signing_ready || canSetupSigning);
  const releaseToConfirm = releases?.find(({ version }) => version === confirmation && version !== installed);

  function install(version: string, confirmed: boolean) {
    if (installDisabled || version === installed) return;
    setConfirmation(null);
    onInstall(version, confirmed);
  }

  function reviewInstall(version: string) {
    const comparison = installed === null ? 1 : compareLauncherVersions(version, installed);
    if (comparison === null || comparison < 0) setConfirmation(version);
    else install(version, false);
  }

  return (
    <div className={`${styles.detailContent} ${styles.launcherContent}`}>
      <Stack gap="lg" className={styles.launcherLayout}>
        <Group justify="space-between">
          <Title order={1}>Install &amp; update</Title>
          <Tooltip label="Refresh releases">
            <ActionIcon
              variant="subtle"
              aria-label="Refresh releases"
              loading={releasesLoading}
              disabled={busy || releasesLoading}
              onClick={onRetryVersions}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Paper withBorder radius="md" p="lg" className={styles.statusBanner} data-tone={summary.tone}>
          <Group justify="space-between" gap="sm">
            <Stack gap={4} aria-live="polite">
              <Title order={2} size="h3">
                {summary.title}
              </Title>
              {summary.detail && (
                <Text size="sm" className={styles.releaseDetail}>
                  {summary.detail}
                </Text>
              )}
            </Stack>
            {recommended && (
              <Button disabled={installDisabled} onClick={() => reviewInstall(recommended)}>
                {installLabel(recommended, installed)}
              </Button>
            )}
            {releases === null && !releasesLoading && (
              <Button variant="default" disabled={busy} onClick={onRetryVersions}>
                Retry
              </Button>
            )}
          </Group>
        </Paper>
        {(recommended || alternative) && !profile.launcher_signing_ready && (
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
        {selectedRelease && (
          <Stack gap="sm" component="section" aria-labelledby="release-history" className={styles.releaseSection}>
            <Title id="release-history" order={2} size="h3">
              Release history
            </Title>
            <div className={styles.releaseHistory}>
              <Stack gap={5} className={styles.releaseList} role="group" aria-label="Available releases">
                {releases?.map(({ version }) => (
                  <ReleaseOption
                    key={version}
                    version={version}
                    latest={version === latest?.version}
                    installed={version === installed}
                    selected={version === selectedRelease.version}
                    disabled={busy}
                    onSelect={() => setChoice(version)}
                  />
                ))}
              </Stack>
              <Stack gap="sm" component="section" aria-labelledby="release-version" className={styles.releaseSelection}>
                <Group justify="space-between" gap="xs" mih={36}>
                  <Title id="release-version" order={3} size="h4">
                    Version {selectedRelease.version}
                  </Title>
                  {alternative && (
                    <Button
                      ml="auto"
                      variant="default"
                      disabled={installDisabled}
                      onClick={() => reviewInstall(selectedRelease.version)}
                    >
                      {installLabel(selectedRelease.version, installed)}
                    </Button>
                  )}
                </Group>
                <LauncherReleaseNotes key={selectedRelease.version} release={selectedRelease} />
              </Stack>
            </div>
          </Stack>
        )}
        {installed !== null && (
          <Group justify="flex-end">
            <Button variant="subtle" color="red" disabled={busy} onClick={onRemove}>
              Remove AeroTizen
            </Button>
          </Group>
        )}
      </Stack>
      {releaseToConfirm && (
        <Modal
          opened
          centered
          title={installLabel(releaseToConfirm.version, installed)}
          onClose={() => setConfirmation(null)}
        >
          <Stack>
            <Text>
              Replace {installed} with {releaseToConfirm.version}? Older versions may lack fixes and may fail to read
              settings saved by a newer version. Some TVs reject downgrades.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmation(null)}>
                Cancel
              </Button>
              <Button color="red" disabled={installDisabled} onClick={() => install(releaseToConfirm.version, true)}>
                {installLabel(releaseToConfirm.version, installed)}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </div>
  );
}
