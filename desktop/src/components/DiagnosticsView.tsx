import { Alert, Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { RefreshCw, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import type { SavedTv, TvPage } from "../contracts";
import { validHost } from "../contracts";
import { platformRows, rootVersion, softwareVersions } from "../tvDetails";
import styles from "../styles.module.css";
import { ConnectionHelp } from "./ConnectionHelp";
import { GithubReportButton } from "./GithubReportButton";

const STATUS = {
  verified: { label: "Verified", color: "green" },
  action: { label: "Action needed", color: "orange" },
  unverified: { label: "Unverified", color: "gray" },
} as const;

type Result = { status: keyof typeof STATUS; detail: ReactNode };

const UNVERIFIED: Result = { status: "unverified", detail: "Run checks when the TV is reachable." };

function developerMode(profile: SavedTv): Result {
  if (profile.transport === "paired_root") {
    return { status: "verified", detail: "The app connected through paired Root access." };
  }
  if (profile.developer_mode === "0") {
    return { status: "action", detail: "Turn on Developer Mode on the TV." };
  }
  const pc = profile.computer_ip;
  if (pc && validHost(pc) && validHost(profile.developer_host) && pc !== profile.developer_host) {
    return { status: "action", detail: `Set Host PC IP to ${pc} in Developer Mode on the TV.` };
  }
  if (profile.developer_mode === "1") {
    return { status: "verified", detail: "Developer Mode is on." };
  }
  return { status: "unverified", detail: "The TV did not report its Developer Mode settings." };
}

function certificates(profile: SavedTv): Result {
  if (profile.launcher_signing_ready) return { status: "verified", detail: "A signing profile is saved for this TV." };
  return {
    status: "action",
    detail:
      profile.launcher_version === null
        ? "Start an install to set up signing certificates."
        : "Use this TV’s original signing profile to update AeroTizen.",
  };
}

function rootAccess(profile: SavedTv): Result {
  if (profile.transport !== "paired_root") {
    return { status: "unverified", detail: "The app connected without paired Root access." };
  }
  const version = rootVersion(profile);
  return {
    status: "verified",
    detail: version ? `Paired Root access ${version} responded.` : "Paired Root access responded.",
  };
}

function homeSettings(profile: SavedTv): Result {
  const settings = profile.native_home_settings;
  if (
    typeof settings?.home_button_app === "string" &&
    typeof settings.home_app === "string" &&
    typeof settings.startup_app === "string" &&
    typeof settings.startup_backup_app === "string" &&
    typeof settings.smart_hub_autostart === "boolean"
  ) {
    return { status: "verified", detail: "The app read the current Home and startup settings." };
  }
  return {
    status: "unverified",
    detail: settings
      ? "The TV returned only some Home and startup settings."
      : "Reading Home and startup settings requires a compatible paired Root connection.",
  };
}

function backup(profile: SavedTv): Result {
  if (profile.home_backup?.status === "saved") {
    return { status: "verified", detail: "The original Home backup is available on this computer." };
  }
  if (profile.home_backup?.status === "unreadable") {
    return { status: "action", detail: "The app could not verify the original Home backup." };
  }
  if (profile.home_backup?.status === "missing" && profile.home_routing_mode === "native") {
    return { status: "action", detail: "Find the original backup before you try to restore Home settings." };
  }
  return {
    status: "unverified",
    detail:
      profile.home_backup?.status === "missing"
        ? "The app saves the backup during Home setup."
        : "Run checks to look for a backup.",
  };
}

function Check({ label, result }: { label: string; result: Result }) {
  const status = STATUS[result.status];
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Text size="sm">{result.detail}</Text>
        <Badge size="sm" variant="light" color={status.color} tt="none">
          {status.label}
        </Badge>
      </dd>
    </div>
  );
}

interface DiagnosticsViewProps {
  profile: SavedTv;
  backendVersion?: string;
  error: string | null;
  loading: boolean;
  disabled: boolean;
  onCheck(): void;
  onPage(page: TvPage): void;
}

export function DiagnosticsView({
  profile,
  backendVersion,
  error,
  loading,
  disabled,
  onCheck,
  onPage,
}: DiagnosticsViewProps) {
  const { tizen, firmware, launcher } = softwareVersions(profile);
  return (
    <Stack className={styles.detailContent} gap="lg">
      <Group justify="space-between">
        <Title order={1}>Diagnostics</Title>
        <Group gap="xs">
          <GithubReportButton profile={profile} backendVersion={backendVersion} />
          <Button leftSection={<RefreshCw size={16} />} onClick={onCheck} loading={loading} disabled={disabled}>
            Run checks
          </Button>
        </Group>
      </Group>
      {error && (
        <Alert title="Could not check the TV" color="orange" role="alert">
          <Stack gap="xs">
            <Text size="sm">{error}</Text>
            <ConnectionHelp computerIp={profile.computer_ip} />
          </Stack>
        </Alert>
      )}
      <Stack gap="md" aria-busy={loading}>
        <Paper withBorder p="md">
          <Title order={2} size="h3">
            Connection
          </Title>
          <dl className={styles.diagnosticChecks}>
            <Check
              label="TV connection"
              result={
                error
                  ? { status: "action", detail: "Check the TV connection and run the checks again." }
                  : { status: "verified", detail: "The app reached this TV and verified its identity." }
              }
            />
            <Check
              label={profile.transport === "paired_root" && !error ? "Connection method" : "Developer Mode"}
              result={error ? UNVERIFIED : developerMode(profile)}
            />
          </dl>
        </Paper>
        <Paper withBorder p="md">
          <Group justify="space-between">
            <Title order={2} size="h3">
              Installation
            </Title>
            <Button variant="default" onClick={() => onPage("launcher")}>
              Install &amp; update
            </Button>
          </Group>
          <dl className={styles.diagnosticChecks}>
            <Check label="Signing certificates" result={error ? UNVERIFIED : certificates(profile)} />
          </dl>
        </Paper>
        <Paper withBorder p="md">
          <Group justify="space-between">
            <Title order={2} size="h3">
              Root and Home
            </Title>
            <Group gap="xs">
              <Button variant="default" onClick={() => onPage("root")}>
                Root access
              </Button>
              <Button variant="default" onClick={() => onPage("home")}>
                Home and startup
              </Button>
            </Group>
          </Group>
          <dl className={styles.diagnosticChecks}>
            <Check label="Root access" result={error ? UNVERIFIED : rootAccess(profile)} />
            <Check label="Read Home settings" result={error ? UNVERIFIED : homeSettings(profile)} />
            <Check label="Original Home backup" result={error ? UNVERIFIED : backup(profile)} />
          </dl>
        </Paper>
        <details className={styles.homeAdvanced}>
          <summary>Technical details</summary>
          <dl className={styles.definitionList}>
            {[
              ["TV model", profile.model],
              ["Tizen version", tizen],
              ["Firmware build", firmware],
              ["AeroTizen version", launcher],
              ...platformRows(profile),
            ].map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
        <Group>
          <Button variant="default" leftSection={<ScrollText size={16} />} onClick={() => onPage("logs")}>
            View logs
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}
