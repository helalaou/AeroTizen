import { Accordion, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import type { DesktopService, HomeBackup, HomeRoutingMode, SavedTv } from "../contracts";
import { canApplyNativeHome } from "../contracts";
import {
  autostartLabel,
  developerModeLabel,
  homeAppLabel,
  platformRows,
  rootStatus,
  rootVersion,
  transportLabel,
} from "../tvDetails";
import styles from "../styles.module.css";
import { ApplyNativeHomeDialog } from "./ApplyNativeHomeDialog";
import type { ApplyNativeHome } from "./ApplyNativeHomeDialog";
import { GithubReportButton } from "./GithubReportButton";
import { HomeBackupDialog } from "./HomeBackupDialog";
import type { RestoreHomeBackup } from "./HomeBackupDialog";
import { RootStatusBadge } from "./RootStatusBadge";

type ActionPage = "home" | "root" | "recovery" | "diagnostics";

const PAGE_TITLES: Record<ActionPage, string> = {
  home: "Home and startup",
  root: "Root",
  recovery: "Backup and recovery",
  diagnostics: "Diagnostics",
};

const HOME_ROUTING_LABELS: Record<HomeRoutingMode, string> = {
  watcher: "Watcher",
  native: "Native Home mode",
  hold: "On hold",
  blocked: "Blocked",
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
  onApplyNativeHome?: ApplyNativeHome;
  readHomeBackup?: DesktopService["readHomeBackup"];
  onRestoreBackup?: RestoreHomeBackup;
}

export function TvActionView({
  page,
  profile,
  backendVersion,
  onApplyNativeHome,
  readHomeBackup,
  onRestoreBackup,
}: TvActionViewProps) {
  const [showApply, setShowApply] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const version = rootVersion(profile);
  const originalBackup = originalBackupLabel(profile.home_backup);
  const backupDate = profile.home_backup?.status === "saved" ? profile.home_backup.captured_at : undefined;
  const home = profile.native_home_settings;
  const nativeSettings = [
    {
      id: "home-button",
      title: "Home button",
      rows: [
        ["Current assignment", homeAppLabel(home?.home_button_app ?? null)],
        ["Saved Home setting", homeAppLabel(home?.home_app ?? null)],
      ],
    },
    {
      id: "startup",
      title: "Startup",
      rows: [
        ["Startup app", homeAppLabel(home?.startup_app ?? null)],
        ["Backup startup app", homeAppLabel(home?.startup_backup_app ?? null)],
        ["Smart Hub autostart", autostartLabel(home?.smart_hub_autostart ?? null)],
      ],
    },
  ];
  return (
    <div className={styles.detailContent}>
      <Stack gap="lg">
        <Group justify="space-between" gap="sm">
          <Title order={1}>{PAGE_TITLES[page]}</Title>
          {page === "home" && (
            <Button variant="default" onClick={() => setShowBackup(true)}>
              {backupDate && readHomeBackup ? "Backup & restore" : "Backup status"}
            </Button>
          )}
        </Group>
        {page === "home" && (
          <Stack gap="md">
            <Paper component="section" aria-labelledby="aerotizen-routing" withBorder p="lg">
              <Group justify="space-between" gap="sm">
                <Stack gap="xs">
                  <Title id="aerotizen-routing" order={2} size="h3">
                    AeroTizen routing
                  </Title>
                  <Text size="sm" role="status">
                    {profile.home_routing_mode ? HOME_ROUTING_LABELS[profile.home_routing_mode] : "Unavailable"}
                  </Text>
                </Stack>
                {onApplyNativeHome && canApplyNativeHome(profile) && (
                  <Button onClick={() => setShowApply(true)}>Apply Native Home</Button>
                )}
              </Group>
            </Paper>
            {rootStatus(profile) === "Yes" && (
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                {nativeSettings.map(({ id, title, rows }) => (
                  <Paper key={id} component="section" aria-labelledby={id} withBorder p="lg">
                    <Title id={id} order={2} size="h3">
                      {title}
                    </Title>
                    <dl className={styles.definitionList}>
                      {rows.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </Paper>
                ))}
              </SimpleGrid>
            )}
            {showApply && onApplyNativeHome && (
              <ApplyNativeHomeDialog
                tvName={profile.name}
                hasBackup={profile.home_backup?.status === "saved"}
                onApply={onApplyNativeHome}
                onClose={() => setShowApply(false)}
              />
            )}
            {showBackup && (
              <HomeBackupDialog
                key={backupDate}
                tvId={profile.id}
                tvName={profile.name}
                status={originalBackup}
                capturedAt={backupDate}
                readBackup={readHomeBackup}
                onRestore={onRestoreBackup}
                onClose={() => setShowBackup(false)}
              />
            )}
          </Stack>
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
