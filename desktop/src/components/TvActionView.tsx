import { Accordion, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import type { DesktopService, HomeBackup, HomeRoutingMode, NativeHomeSettings, SavedTv } from "../contracts";
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

const HOME_STATUS: Record<HomeRoutingMode, string> = {
  watcher: "AeroTizen reopens after Samsung Home",
  native: "AeroTizen opens directly",
  hold: "AeroTizen Home is on hold",
  blocked: "AeroTizen Home is blocked",
};

function originalBackupLabel(backup: HomeBackup | undefined): string {
  if (backup?.status === "saved") return `Original backup saved ${new Date(backup.captured_at).toLocaleString()}`;
  if (backup?.status === "missing") return "No original Home backup found on this computer.";
  if (backup?.status === "unreadable") return "The original Home backup could not be verified.";
  return "Refresh the TV connection to check for an original Home backup.";
}

function HomeSettingRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className={styles.definitionList}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CurrentHomeSettings({ home }: { home?: NativeHomeSettings }) {
  return (
    <Paper component="section" aria-labelledby="current-home-settings" withBorder p="lg">
      <Title id="current-home-settings" order={2} size="h3">
        Current settings
      </Title>
      <HomeSettingRows
        rows={[
          ["Home button", homeAppLabel(home?.home_button_app ?? null)],
          ["At startup", homeAppLabel(home?.startup_app ?? null)],
          ["Smart Hub auto-start", autostartLabel(home?.smart_hub_autostart ?? null)],
        ]}
      />
      <details className={styles.homeAdvanced}>
        <summary>Advanced details</summary>
        <HomeSettingRows
          rows={[
            ["Saved Home setting", homeAppLabel(home?.home_app ?? null)],
            ["Backup startup app", homeAppLabel(home?.startup_backup_app ?? null)],
          ]}
        />
      </details>
    </Paper>
  );
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
  const canReviewBackup = Boolean(backupDate && readHomeBackup);
  const canSetUpHome = Boolean(onApplyNativeHome && canApplyNativeHome(profile));
  const homeStatus = profile.home_routing_mode ? HOME_STATUS[profile.home_routing_mode] : "Home mode is unavailable";
  let backupNotice = canReviewBackup ? null : originalBackup;
  if (canSetUpHome && !backupDate) backupNotice = "Your original settings are saved before setup.";

  return (
    <div className={styles.detailContent}>
      <Stack gap="lg">
        <Group justify="space-between" gap="sm">
          <Title order={1}>{PAGE_TITLES[page]}</Title>
          {page === "home" && canReviewBackup && (
            <Button variant="default" onClick={() => setShowBackup(true)}>
              {onRestoreBackup ? "Restore original settings…" : "View original settings"}
            </Button>
          )}
        </Group>
        {page === "home" && (
          <Stack gap="md">
            <Paper component="section" aria-labelledby="home-mode" withBorder p="lg">
              <Group justify="space-between" gap="sm">
                <Stack gap="xs" aria-live="polite">
                  <Title id="home-mode" order={2} size="h3">
                    {profile.launcher_version === null ? "AeroTizen is not installed" : homeStatus}
                  </Title>
                  {backupNotice && (
                    <Text size="sm" c="dimmed">
                      {backupNotice}
                    </Text>
                  )}
                </Stack>
                {canSetUpHome && <Button onClick={() => setShowApply(true)}>Use AeroTizen for Home and startup</Button>}
              </Group>
            </Paper>
            {rootStatus(profile) === "Yes" ? (
              <CurrentHomeSettings home={profile.native_home_settings} />
            ) : (
              <Text size="sm" c="dimmed">
                Verify root access to see the TV’s current Home button and startup settings.
              </Text>
            )}
            {showApply && onApplyNativeHome && (
              <ApplyNativeHomeDialog
                tvName={profile.name}
                hasBackup={profile.home_backup?.status === "saved"}
                onApply={onApplyNativeHome}
                onClose={() => setShowApply(false)}
              />
            )}
            {showBackup && canReviewBackup && (
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
              <RootStatusBadge status={rootStatus(profile)} />
              {version && (
                <Text size="sm" c="dimmed">
                  Root access version: {version}
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
