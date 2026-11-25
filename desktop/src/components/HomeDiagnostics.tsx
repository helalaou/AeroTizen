import { Code, List, Stack, Text } from "@mantine/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DesktopService, HomeDiagnosticAttempt } from "../contracts";
import { LOG_ACTIONS } from "../services/desktopLogs";
import type { DesktopLog } from "../services/desktopLogs";
import styles from "../styles.module.css";

const OUTCOMES: Record<string, string> = {
  pending: "No confirmed result from the TV.",
  failed: "Setup failed.",
  rolled_back: "Setup failed. The TV restored the original settings.",
  applied: "The TV replied. The computer did not verify the final settings.",
  restored: "The TV replied. The computer did not verify the final settings.",
  applied_verified: "Native Home applied and verified.",
  restored_verified: "Original Home settings restored and verified.",
};

const HOST_FAILURE_STAGES = {
  writer_response: "Wait for the TV helper result",
  native_result: "Native Home changes",
  final_verification: "Verify the settings from this computer",
};

const STEP_OUTCOMES = { ok: "OK", failed: "Failed", already_set: "Already set" };

const STEP_LABELS: Record<string, string> = {
  watcher_hold: "Pause the watcher",
  direct_write: "Write Home and startup settings",
  enable_autostart: "Enable Smart Hub autostart",
  verify_boot: "Verify startup settings",
  retry_startup_ids: "Retry startup app IDs",
  restore_startup_settings: "Restore original startup settings",
  watcher_commit: "Confirm Home routing",
  rollback: "Roll back changes",
  watcher_resume: "Resume the watcher",
};

function Attempt({ attempt }: { attempt: HomeDiagnosticAttempt }) {
  const { state, created_at, command, host_failure_stage, error_code, native_result } = attempt;
  const steps = native_result?.Steps ?? [];
  const code = native_result?.Error && native_result.Error !== "detail_omitted" ? native_result.Error : error_code;
  return (
    <Stack gap={4}>
      <Text size="sm">
        {command.action === "apply" ? "Apply" : "Restore"}
        {created_at && <> · {new Date(created_at).toLocaleString()}</>}
      </Text>
      <Text size="sm">{OUTCOMES[state ?? ""] ?? "Outcome unavailable."}</Text>
      {native_result?.StartupSettingsRestored && (
        <Text size="sm">The TV kept Native Home and restored the original startup settings.</Text>
      )}
      {host_failure_stage && (
        <Text size="sm">Failed step on this computer: {HOST_FAILURE_STAGES[host_failure_stage]}</Text>
      )}
      {code && code !== "detail_omitted" && <Code>{code}</Code>}
      {steps.length > 0 && (
        <details className={styles.homeAdvanced}>
          <summary>TV setup steps ({steps.length})</summary>
          <List type="ordered" size="sm" mt="xs">
            {steps.map(({ Step, Setting, Outcome, DurationMs, Differences }, index) => (
              <List.Item key={index}>
                {STEP_LABELS[Step] ?? Step.replaceAll("_", " ")}
                {Setting && (
                  <>
                    {" "}
                    · <Code>{Setting}</Code>
                  </>
                )}{" "}
                · {STEP_OUTCOMES[Outcome]}
                {DurationMs !== undefined && <> · {DurationMs} ms</>}
                {Differences?.length ? <> · Different settings: {Differences.join(", ")}</> : null}
              </List.Item>
            ))}
          </List>
        </details>
      )}
    </Stack>
  );
}

interface HomeDiagnosticsProps {
  id: string;
  log: DesktopLog;
  refresh: number;
  read?: DesktopService["readHomeDiagnostics"];
}

export function HomeDiagnostics({ id, log, refresh, read }: HomeDiagnosticsProps) {
  const [attempt, setAttempt] = useState<HomeDiagnosticAttempt | null>();
  const [failed, setFailed] = useState(false);
  const entries = useSyncExternalStore(log.subscribe, log.getSnapshot);
  const recentError = entries.find(
    ({ action, outcome }) =>
      outcome === "failed" && (action === "homeBackupSave" || action === "homeApply" || action === "homeRestore"),
  );

  useEffect(() => {
    if (!read) return;
    let active = true;
    void read(id).then(
      (result) => {
        if (!active) return;
        setFailed(false);
        setAttempt(result);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [id, read, refresh]);

  let content = (
    <Text size="sm">{read && attempt === undefined ? "Reading saved attempts…" : "No saved Home attempt."}</Text>
  );
  if (failed) content = <Text size="sm">Could not read the saved attempt.</Text>;
  else if (attempt) content = <Attempt attempt={attempt} />;

  return (
    <Stack gap="xs" mt="md">
      <Text fw={600} size="sm">
        Last saved Home attempt for this TV
      </Text>
      {content}
      {recentError && (
        <Stack gap={4}>
          <Text fw={600} size="sm">
            Most recent Home error on this computer
          </Text>
          <Text size="sm">
            {LOG_ACTIONS[recentError.action]} · {new Date(recentError.timestamp).toLocaleString()} ·{" "}
            <Code>{recentError.code}</Code>
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
