import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Center,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { ArrowUpCircle, Clock, RefreshCw, Shield, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { RootAccessStatus } from "../contracts";
import { errorMessage } from "../contracts";
import { rootSetupStage } from "../services/rootAccess";
import { showToast } from "../Toasts";
import styles from "../styles.module.css";
import { rootStatus } from "../tvDetails";
import { RootStatusBadge } from "./RootStatusBadge";

interface RootAccessPanelProps {
  status: RootAccessStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onRefresh(): void;
  onSetup(): void;
  onUpdate(): void;
  onRemove?(): void;
  onRevealRecovery?(): Promise<void | string>;
}

export function RootAccessPanel({
  status,
  loading,
  busy,
  error,
  onRefresh,
  onSetup,
  onUpdate,
  onRemove,
  onRevealRecovery,
}: RootAccessPanelProps) {
  const [revealNotice, setRevealNotice] = useState<string | null>(null);
  const stage = status ? rootSetupStage(status) : null;
  const fresh = Boolean(status && !loading && !error);
  const hasSavedSetup = status?.recovery_saved && status.phase !== "removed";
  const showSetupAction =
    fresh && stage === "prepare" && !status?.root_available && !status?.update_pending && !hasSavedSetup;
  const waitingForRestart = fresh && stage === "restart" && !status?.update_pending;
  const ready = stage === "complete" && !status?.update_pending;
  const setupTitle = status?.root_absence_verified ? "Root access isn’t set up" : "Root access isn’t verified";
  const titles = {
    prepare: hasSavedSetup ? "Setup interrupted" : "Not set up on this computer",
    restart: "Waiting for TV restart",
    complete: null,
    blocked: onRemove ? "Root removal in progress" : "Recovery required",
    unavailable: "Could not verify root access",
  };

  return (
    <Stack className={styles.detailContent} gap="lg">
      <Group justify="space-between">
        <Title order={1}>Root access</Title>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          aria-label="Refresh root status"
          title="Refresh root status"
          loading={loading}
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </ActionIcon>
      </Group>
      {showSetupAction || waitingForRestart ? (
        <Center flex={1}>
          <Stack align="center" gap="sm" ta="center" maw={360}>
            <ThemeIcon variant="light" size={48} radius="md">
              {waitingForRestart ? <Clock size={24} aria-hidden="true" /> : <Shield size={24} aria-hidden="true" />}
            </ThemeIcon>
            <Title order={2} size="h3">
              {waitingForRestart ? titles.restart : setupTitle}
            </Title>
            <Text size="sm" c="dimmed">
              {waitingForRestart
                ? "Your progress is saved. Continue setup to check root access after the TV restarts."
                : "Set up root access to remap your remote’s app buttons and show Stremio titles in Continue Watching."}
            </Text>
            <Button disabled={busy} onClick={onSetup}>
              {waitingForRestart ? "Continue setup" : "Set up root access"}
            </Button>
          </Stack>
        </Center>
      ) : (
        <Paper withBorder p="lg" aria-busy={loading}>
          <Stack gap="md">
            {loading ? (
              <>
                <Skeleton width={200} height={22} />
                {[160, 180, 140].map((width) => (
                  <Skeleton key={width} width={width} height={16} />
                ))}
                <Text className={styles.srOnly} role="status">
                  Checking root access…
                </Text>
              </>
            ) : (
              <>
                {error && (
                  <Alert role="alert" color="red">
                    {error}
                  </Alert>
                )}
                {fresh && status && stage && (
                  <>
                    {!ready && (
                      <Group gap="xs">
                        <ShieldCheck size={20} aria-hidden="true" />
                        <Title order={2} size="h3">
                          {status.update_pending ? "Root access update in progress" : titles[stage]}
                        </Title>
                      </Group>
                    )}
                    {stage === "prepare" && (
                      <Text size="sm">
                        {hasSavedSetup
                          ? "Your progress is saved. Continue setup using this computer's existing recovery record."
                          : "Start setup here, or use the computer where this TV was set up before."}
                      </Text>
                    )}
                    {status.update_pending && (
                      <Text size="sm">
                        Update progress is saved. Continue the update to check the installed version after the TV
                        restarts.
                      </Text>
                    )}
                    {stage === "unavailable" && (
                      <Text size="sm">
                        Turn the TV on and check the connection, then refresh. Saved setup details do not confirm
                        current root access.
                      </Text>
                    )}
                    {stage === "blocked" && (
                      <Text size="sm">
                        {onRemove
                          ? "Removal progress is saved on this computer."
                          : "Finish root removal on the original computer before starting a new setup."}
                      </Text>
                    )}
                    <dl className={styles.definitionList} style={ready ? { marginTop: 0 } : undefined}>
                      {!ready && (
                        <div>
                          <dt>Rooted</dt>
                          <dd>
                            <RootStatusBadge status={rootStatus(null, status)} />
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Installed version</dt>
                        <dd>
                          <Group gap="sm" justify="space-between">
                            <span>{status.runtime_version ?? "Unavailable"}</span>
                            {status.update_available && (
                              <Button
                                color="#a13b0a"
                                variant="light"
                                size="xs"
                                leftSection={<ArrowUpCircle size={15} aria-hidden="true" />}
                                disabled={busy}
                                onClick={onUpdate}
                              >
                                Update available
                              </Button>
                            )}
                          </Group>
                        </dd>
                      </div>
                      {!ready && (
                        <div>
                          <dt>Automatic startup</dt>
                          <dd>
                            {status.automatic_boot_verified && status.bootstrap_completed ? "Verified" : "Not verified"}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Recovery record</dt>
                        <dd>
                          <Group gap="xs">
                            <span>
                              {status.recovery_saved ? "Saved on this computer" : "Not saved on this computer"}
                            </span>
                            {status.recovery_saved && onRevealRecovery && (
                              <Anchor
                                component="button"
                                type="button"
                                size="sm"
                                c="blue.7"
                                underline="always"
                                onClick={() => {
                                  setRevealNotice(null);
                                  void onRevealRecovery()
                                    .then((notice) => {
                                      if (notice) setRevealNotice(notice);
                                    })
                                    .catch((error: unknown) => showToast(errorMessage(error), "error"));
                                }}
                              >
                                Show in folder
                              </Anchor>
                            )}
                          </Group>
                        </dd>
                      </div>
                    </dl>
                    {revealNotice && (
                      <Text role="status" size="sm">
                        {revealNotice}
                      </Text>
                    )}
                    {status.update_pending && (
                      <Group>
                        <Button disabled={busy} onClick={onUpdate}>
                          Continue update
                        </Button>
                      </Group>
                    )}
                    {!status.update_pending && stage === "prepare" && (
                      <Group>
                        <Button disabled={busy} onClick={onSetup}>
                          {hasSavedSetup ? "Continue setup" : "Set up root access"}
                        </Button>
                      </Group>
                    )}
                  </>
                )}
                {!fresh && (
                  <Button variant="default" onClick={onRefresh} disabled={busy}>
                    Retry
                  </Button>
                )}
              </>
            )}
          </Stack>
        </Paper>
      )}
      {fresh && onRemove && status?.recovery_saved && (ready || stage === "blocked") && (
        <Group justify="flex-end" mt="auto" mb="xl">
          <Button variant="light" color="red" disabled={busy} onClick={onRemove}>
            {stage === "blocked" ? "Continue removal" : "Remove root"}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
