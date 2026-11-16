import { Accordion, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { HomeBackup, SavedTv } from "../contracts";
import { developerModeLabel, platformRows, rootVersion, transportLabel } from "../tvDetails";
import styles from "../styles.module.css";
import { GithubReportButton } from "./GithubReportButton";
import { RootStatusBadge } from "./RootStatusBadge";

type ActionPage = "home" | "root" | "recovery" | "diagnostics";

const PAGE_TITLES: Record<ActionPage, string> = {
  home: "Home and startup",
  root: "Root",
  recovery: "Backup and recovery",
  diagnostics: "Diagnostics",
};

function originalBackupLabel(backup: HomeBackup | undefined): string {
  if (backup?.status === "saved") return `Original backup saved ${new Date(backup.captured_at).toLocaleString()}`;
  if (backup?.status === "missing") return "No original Home backup found on this computer.";
  if (backup?.status === "unreadable") return "The original Home backup could not be verified.";
  return "Refresh the TV connection to check for an original Home backup.";
}

interface TvActionViewProps {
  page: ActionPage;
  profile: SavedTv;
  backendVersion?: string;
  onPage(page: ActionPage): void;
}

export function TvActionView({ page, profile, backendVersion, onPage }: TvActionViewProps) {
  const version = rootVersion(profile);
  const originalBackup = originalBackupLabel(profile.home_backup);
  return (
    <div className={styles.detailContent}>
      <Stack gap="lg">
        <Title order={1}>{PAGE_TITLES[page]}</Title>
        {page === "home" && (
          <Paper withBorder p="lg">
            <Stack gap="sm">
              <Text>Changes to the Home button, startup and app-return settings are unavailable in this build.</Text>
              <Text size="sm" c="dimmed">
                {originalBackup}
              </Text>
              <Group>
                <Button variant="default" onClick={() => onPage("recovery")}>
                  Backup and recovery
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
        {page === "recovery" && (
          <Paper withBorder p="lg">
            <Stack gap="sm">
              <Title order={2} size="h3">
                Original Home settings
              </Title>
              <Text>{originalBackup}</Text>
            </Stack>
          </Paper>
        )}
        {page === "root" && (
          <Paper withBorder p="lg">
            <Stack gap="sm">
              <Title order={2} size="h3">
                Rooted
              </Title>
              <RootStatusBadge profile={profile} />
              {version && (
                <Text size="sm" c="dimmed">
                  Root helper version: {version}
                </Text>
              )}
            </Stack>
          </Paper>
        )}
        {page === "diagnostics" && (
          <>
            <Paper withBorder p="lg">
              <Stack gap="sm">
                <Title order={2} size="h3">
                  Share TV details
                </Title>
                <Text size="sm" c="dimmed">
                  Open a GitHub issue draft with the TV model, versions and connection status.
                </Text>
                <Group>
                  <GithubReportButton profile={profile} backendVersion={backendVersion} />
                </Group>
              </Stack>
            </Paper>
            <Accordion variant="separated" order={2}>
              <Accordion.Item value="technical-details">
                <Accordion.Control>Technical details</Accordion.Control>
                <Accordion.Panel>
                  <dl className={styles.definitionList}>
                    {[
                      ["Connection method", transportLabel(profile.transport)],
                      ["Developer Mode", developerModeLabel(profile.developer_mode)],
                      ["Host PC IP on TV", profile.developer_host],
                      ...platformRows(profile),
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {profile.transport === "developer" && (
                    <Text size="sm" c="dimmed" mt="sm">
                      Keep the TV on the same network as this computer. Enable Developer Mode on the TV and set Host PC
                      IP to this computer’s address.
                    </Text>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </>
        )}
      </Stack>
    </div>
  );
}
