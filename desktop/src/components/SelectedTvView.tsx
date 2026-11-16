import { Button, Group, Paper, Text, Title } from "@mantine/core";
import { CircleArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import type { SavedTv } from "../contracts";
import { rootVersion, softwareRows } from "../tvDetails";
import { launcherUpdate } from "../services/launcherVersions";
import styles from "../styles.module.css";
import { GithubReportButton } from "./GithubReportButton";
import { RootStatusBadge } from "./RootStatusBadge";

interface SelectedTvViewProps {
  profile: SavedTv;
  backendVersion?: string;
  latestLauncher?: string | null;
  onLauncher(): void;
}

export function SelectedTvView({ profile, backendVersion, latestLauncher, onLauncher }: SelectedTvViewProps) {
  const version = rootVersion(profile);
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
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {label === "Launcher version" && update ? (
                  <Group gap="xs" className={styles.launcherVersion}>
                    <span>{value}</span>
                    <Button
                      size="xs"
                      variant="light"
                      color="#a13b0a"
                      leftSection={<CircleArrowUp size={15} aria-hidden="true" />}
                      onClick={onLauncher}
                    >
                      Update available
                    </Button>
                  </Group>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Paper>
    </div>
  );
}
