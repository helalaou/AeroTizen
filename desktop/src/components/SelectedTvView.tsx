import { Button, Group, Paper, Stack, Title } from "@mantine/core";
import { CircleArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import type { RootAccessStatus, SavedTv } from "../contracts";
import { rootStatus, rootVersion, softwareVersions } from "../tvDetails";
import { launcherUpdate } from "../services/launcherVersions";
import styles from "../styles.module.css";
import { GithubReportButton } from "./GithubReportButton";
import { RootStatusBadge } from "./RootStatusBadge";

interface SelectedTvViewProps {
  profile: SavedTv;
  desktopVersion?: string;
  latestLauncher?: string | null;
  rootAccessStatus: RootAccessStatus | null;
  onLauncher(): void;
  onRootAccess(): void;
}

function OverviewRow({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {action ? (
          <Group gap="xs" className={styles.overviewActions}>
            <span>{value}</span>
            {action}
          </Group>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function UpdateButton({ onClick, label }: { onClick(): void; label?: string }) {
  return (
    <Button
      size="xs"
      variant="light"
      color="#a13b0a"
      leftSection={<CircleArrowUp size={15} aria-hidden="true" />}
      aria-label={label}
      onClick={onClick}
    >
      Update available
    </Button>
  );
}

export function SelectedTvView({
  profile,
  desktopVersion,
  latestLauncher,
  rootAccessStatus,
  onLauncher,
  onRootAccess,
}: SelectedTvViewProps) {
  const rooted = rootStatus(profile, rootAccessStatus);
  const helperVersion = rootAccessStatus?.runtime_version ?? rootVersion(profile);
  const { tizen, launcher } = softwareVersions(profile);
  const update = launcherUpdate(profile.launcher_version, latestLauncher);
  let launcherAction: ReactNode;
  if (profile.launcher_version === null) {
    launcherAction = (
      <Button size="xs" variant="light" onClick={onLauncher}>
        Install AeroTizen
      </Button>
    );
  } else if (update) {
    launcherAction = <UpdateButton onClick={onLauncher} />;
  }

  return (
    <Stack className={styles.detailContent} gap="lg">
      <Group justify="space-between">
        <Title order={1}>Overview</Title>
        <GithubReportButton profile={profile} desktopVersion={desktopVersion} />
      </Group>
      <Paper withBorder radius="md" p="lg" className={styles.details}>
        <dl className={`${styles.definitionList} ${styles.overviewDetails}`}>
          <OverviewRow label="Model" value={profile.model} />
          <OverviewRow
            label="Rooted"
            value={<RootStatusBadge status={rooted} />}
            action={
              rooted !== "Yes" && (
                <Button size="xs" variant={rooted === "No" ? "light" : "default"} onClick={onRootAccess}>
                  {rooted === "No" ? "Set up root access" : "Check root status"}
                </Button>
              )
            }
          />
          {helperVersion && (
            <OverviewRow
              label="Root access version"
              value={helperVersion}
              action={
                rootAccessStatus?.update_available && (
                  <UpdateButton label="Root access update available" onClick={onRootAccess} />
                )
              }
            />
          )}
          <OverviewRow label="Tizen version" value={tizen} />
          <OverviewRow label="AeroTizen version" value={launcher} action={launcherAction} />
          <OverviewRow label="IP address" value={profile.host} />
        </dl>
      </Paper>
    </Stack>
  );
}
