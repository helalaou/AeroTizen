import { ActionIcon, Alert, Badge, Button, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { ArrowUpCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { RootAccessStatus } from "../contracts";
import { rootSetupStage } from "../services/rootAccess";
import styles from "../styles.module.css";

interface RootAccessPanelProps {
  status: RootAccessStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onRefresh(): void;
  onSetup(): void;
  onUpdate(): void;
}

export function RootAccessPanel({ status, loading, busy, error, onRefresh, onSetup, onUpdate }: RootAccessPanelProps) {
  const stage = status ? rootSetupStage(status) : null;
  const fresh = Boolean(status && !loading && !error);
  const titles = {
    prepare: status?.recovery_saved && status.phase !== "removed" ? "Setup interrupted" : "Not set up on this computer",
    restart: "Waiting for restart verification",
    complete: "Root access ready",
    blocked: "Recovery required",
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
                  <Group gap="xs">
                    <ShieldCheck size={20} aria-hidden="true" />
                    <Title order={2} size="h3">
                      {status.update_pending ? "Root helper update in progress" : titles[stage]}
                    </Title>
                  </Group>
                  {stage === "prepare" && (
                    <Text size="sm">
                      {status.recovery_saved && status.phase !== "removed"
                        ? "Your progress is saved. Continue setup using this computer's existing recovery record."
                        : "Start setup here, or use the computer where this TV was set up before."}
                    </Text>
                  )}
                  {stage === "restart" && (
                    <Text size="sm">
                      The helper is installed. Complete the TV restart steps, then verify that root access starts
                      automatically.
                    </Text>
                  )}
                  {status.update_pending && (
                    <Text size="sm">
                      Update progress is saved. Continue the update to check the new helper after a TV restart.
                    </Text>
                  )}
                  {stage === "complete" && !status.update_pending && (
                    <Text size="sm">Root access is live and its automatic startup has been verified.</Text>
                  )}
                  {stage === "unavailable" && (
                    <Text size="sm">
                      Turn the TV on and check the connection, then refresh. Saved setup details do not confirm current
                      root access.
                    </Text>
                  )}
                  {stage === "blocked" && (
                    <Text size="sm">
                      Root removal is still in progress. Finish recovery with the CLI on the original computer before
                      starting a new setup.
                    </Text>
                  )}
                  <dl className={styles.definitionList}>
                    <div>
                      <dt>Rooted</dt>
                      <dd>
                        <Badge variant="light" color={status.root_available ? "green" : "gray"}>
                          {status.root_available ? "Yes" : "Unverified"}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt>Helper version</dt>
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
                    <div>
                      <dt>Automatic startup</dt>
                      <dd>
                        {status.automatic_boot_verified && status.bootstrap_completed ? "Verified" : "Not verified"}
                      </dd>
                    </div>
                    <div>
                      <dt>Recovery progress</dt>
                      <dd>{status.recovery_saved ? "Saved on this computer" : "Not created yet"}</dd>
                    </div>
                  </dl>
                  {status.update_pending && (
                    <Group>
                      <Button disabled={busy} onClick={onUpdate}>
                        Continue update
                      </Button>
                    </Group>
                  )}
                  {!status.update_pending && (stage === "prepare" || stage === "restart") && (
                    <Group>
                      <Button disabled={busy} onClick={onSetup}>
                        {stage === "restart" || (status.recovery_saved && status.phase !== "removed")
                          ? "Continue setup"
                          : "Set up root access"}
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
    </Stack>
  );
}
