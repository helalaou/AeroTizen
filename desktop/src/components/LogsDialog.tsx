import { Alert, Button, Checkbox, Code, Group, Modal, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { isTauri } from "@tauri-apps/api/core";
import { Download } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { errorMessage } from "../contracts";
import { LOG_ACTIONS, LOG_OUTCOMES } from "../services/desktopLogs";
import type { DesktopLog } from "../services/desktopLogs";
import { exportLogs } from "../services/exportLogs";
import { showToast } from "../Toasts";

const OUTCOME_COLORS = {
  started: "gray",
  completed: "green",
  pending: "blue",
  partial: "orange",
  failed: "red",
  cancelled: "gray",
} as const;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface LogsDialogProps {
  log: DesktopLog;
  simulator: boolean;
  tvId?: string;
  onClose(): void;
}

export function LogsDialog({ log, simulator, tvId, onClose }: LogsDialogProps) {
  const entries = useSyncExternalStore(log.subscribe, log.getSnapshot);
  const [includeTv, setIncludeTv] = useState(false);
  const [includeHome, setIncludeHome] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCollectTv = isTauri() && !simulator && Boolean(tvId);

  async function save() {
    if (exporting || !entries.length) return;
    setExporting(true);
    setError(null);
    try {
      const result = await exportLogs(entries, {
        simulator,
        tvId: canCollectTv ? (tvId ?? null) : null,
        includeTv: canCollectTv && includeTv,
        includeHome: canCollectTv && includeHome,
      });
      if (result.saved) {
        showToast(
          result.unavailable?.length
            ? `Logs exported. Could not collect ${result.unavailable.join(" or ")}.`
            : "Logs exported.",
        );
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal
      opened
      centered
      size="xl"
      title="Logs"
      onClose={onClose}
      withCloseButton={!exporting}
      closeOnEscape={!exporting}
      closeOnClickOutside={!exporting}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {simulator ? "Simulated desktop activity." : "Recent desktop activity."} Newest first.
          </Text>
          <Button
            leftSection={<Download size={16} aria-hidden="true" />}
            loading={exporting}
            disabled={!entries.length}
            onClick={() => void save()}
          >
            Export logs
          </Button>
        </Group>
        {canCollectTv && (
          <Group gap="md" align="flex-start">
            <Checkbox
              label="Include launcher logs from TV"
              checked={includeTv}
              disabled={exporting}
              onChange={(event) => setIncludeTv(event.currentTarget.checked)}
            />
            <Checkbox
              label="Include Home settings from TV"
              description="Requires paired Root access."
              checked={includeHome}
              disabled={exporting}
              onChange={(event) => setIncludeHome(event.currentTarget.checked)}
            />
          </Group>
        )}
        {error && (
          <Alert role="alert" color="red">
            {error}
          </Alert>
        )}
        {entries.length ? (
          <ScrollArea.Autosize mah="min(55vh, 32rem)">
            <Table aria-label="Desktop logs" stickyHeader verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Result</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {entries.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>
                      <Text component="time" size="sm" dateTime={entry.timestamp} title={entry.timestamp}>
                        {timeFormat.format(new Date(entry.timestamp))}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{LOG_ACTIONS[entry.action]}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Text
                          c={`var(--mantine-color-${OUTCOME_COLORS[entry.outcome]}-light-color)`}
                          size="xs"
                          fw={600}
                        >
                          {LOG_OUTCOMES[entry.outcome]}
                        </Text>
                        {entry.durationMs !== null && (
                          <Text size="xs" c="dimmed">
                            {entry.durationMs} ms
                          </Text>
                        )}
                      </Group>
                      {entry.code && <Code style={{ overflowWrap: "anywhere" }}>{entry.code}</Code>}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        ) : (
          <Text size="sm" c="dimmed">
            No activity recorded yet.
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
