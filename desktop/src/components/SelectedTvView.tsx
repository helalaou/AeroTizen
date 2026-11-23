import { Button, Group, Paper, Text, Title } from "@mantine/core";
import { CircleArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import type { RootAccessStatus, SavedTv } from "../contracts";
import { rootVersion, softwareRows } from "../tvDetails";
import { launcherUpdate } from "../services/launcherVersions";
import styles from "../styles.module.css";
import { GithubReportButton } from "./GithubReportButton";
import { RootStatusBadge } from "./RootStatusBadge";

interface SelectedTvViewProps {
  profile: SavedTv;
  backendVersion?: string;
  latestLauncher?: string | null;
  rootAccessStatus: RootAccessStatus | null;
  onLauncher(): void;
  onRootAccess(): void;
}

export function SelectedTvView({
  profile,
  backendVersion,
  latestLauncher,
  rootAccessStatus,
  onLauncher,
  onRootAccess,
}: SelectedTvViewProps) {
  const version = rootAccessStatus?.runtime_version ?? rootVersion(profile);
  const update = launcherUpdate(profile.launcher_version, latestLauncher);
  const versionRows: [string, string][] = version ? [["Root helper version", version]] : [];
  const rows: [string, ReactNode][] = [
    ["Model", profile.model],
    ["Rooted", <RootStatusBadge profile={profile} />],
    ...versionRows,
    ...softwareRows(profile),
    ["IP address", profile.host],
    ["Last checked", new Date(profile.checked_at).toLocaleString()],
  ];
  return (
    <div className={styles.detailContent}>
      <Title order={1}>Overview</Title>
      <Group gap="xs" mt={8}>
        <Text c="dimmed">{profile.name}</Text>
      </Group>
      <Paper withBorder radius="md" p="lg" className={styles.details}>
        <Group justify="space-between">
          <Title order={2} size="h3">
            TV details
          </Title>
          <GithubReportButton profile={profile} backendVersion={backendVersion} />
        </Group>
        <dl className={styles.definitionList}>
          {rows.map(([label, value]) => {
            const rootUpdate = label === "Root helper version" && rootAccessStatus?.update_available;
            const hasUpdate = rootUpdate || (label === "Launcher version" && update);
            return (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {hasUpdate ? (
                    <Group gap="xs" className={styles.softwareVersion}>
                      <span>{value}</span>
                      <Button
                        size="xs"
                        variant="light"
                        color="#a13b0a"
                        leftSection={<CircleArrowUp size={15} aria-hidden="true" />}
                        aria-label={rootUpdate ? "Root helper update available" : undefined}
                        onClick={rootUpdate ? onRootAccess : onLauncher}
                      >
                        Update available
                      </Button>
                    </Group>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </Paper>
    </div>
  );
}
