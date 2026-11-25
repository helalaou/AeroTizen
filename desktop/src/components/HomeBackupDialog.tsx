import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useId, useRef, useState } from "react";
import { errorMessage } from "../contracts";
import type { DesktopService, HomeBackupSettings } from "../contracts";
import { showToast } from "../Toasts";
import styles from "../styles.module.css";
import { autostartLabel, homeAppLabel } from "../tvDetails";

export type RestoreHomeBackup = (capturedAt: string, reportError: (message: string) => void) => Promise<boolean>;

interface HomeBackupDialogProps {
  tvId: string;
  tvName: string;
  status: string;
  capturedAt?: string;
  readBackup?: DesktopService["readHomeBackup"];
  onRestore?: RestoreHomeBackup;
  onClose: () => void;
  onViewLogs: () => void;
}

export function HomeBackupDialog({
  tvId,
  tvName,
  status,
  capturedAt,
  readBackup,
  onRestore,
  onClose,
  onViewLogs,
}: HomeBackupDialogProps) {
  const [reviewedBackup, setReviewedBackup] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<HomeBackupSettings | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const restoreAvailabilityId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!capturedAt || !readBackup) return;
    let open = true;
    void readBackup(tvId, capturedAt).then(
      (saved) => {
        if (open) setSettings(saved);
      },
      (failure) => {
        if (open) setReadError(errorMessage(failure));
      },
    );
    return () => {
      open = false;
    };
  }, [capturedAt, readBackup, tvId]);

  useEffect(() => {
    if (reviewedBackup) cancelButton.current?.focus();
  }, [reviewedBackup]);

  const savedRows = settings
    ? [
        ["Home button assignment", homeAppLabel(settings.home_button_app)],
        ["Saved Home setting", homeAppLabel(settings.home_app)],
        ["Startup app", homeAppLabel(settings.startup_app)],
        ["Backup startup app", homeAppLabel(settings.startup_backup_app)],
        ["Start screen", homeAppLabel(settings.first_screen)],
        ["Smart Hub autostart", autostartLabel(settings.smart_hub_autostart)],
      ]
    : [];

  async function confirmRestore() {
    if (!onRestore || !reviewedBackup || !settings || restoring) return;
    setRestoring(true);
    setError(null);
    const success = await onRestore(reviewedBackup, setError);
    setRestoring(false);
    if (success) {
      onClose();
      showToast("Original Home and startup settings restored.");
    } else {
      setError((message) => message ?? "Could not start the restore. Try again.");
    }
  }

  return (
    <Modal
      opened
      centered
      title={reviewedBackup ? "Restore original settings?" : "Original Home backup"}
      onClose={onClose}
      withCloseButton={!restoring}
      closeOnClickOutside={!restoring}
      closeOnEscape={!restoring}
      closeButtonProps={{ "aria-label": "Close backup status" }}
    >
      <Stack gap="md" aria-busy={restoring}>
        {reviewedBackup ? (
          <Text size="sm">
            Restore these settings on <strong>{tvName}</strong>. If AeroTizen is installed, it will switch to Watcher
            mode.
          </Text>
        ) : (
          <Text size="sm">{status}</Text>
        )}
        {settings && (
          <dl className={styles.definitionList} aria-label="Original Home and startup settings">
            {savedRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {capturedAt && readBackup && !settings && !readError && (
          <Text size="sm" role="status">
            Loading saved settings…
          </Text>
        )}
        {(readError || error) && (
          <Alert color="red" role="alert">
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{readError || error}</Text>
              <Button size="xs" variant="default" onClick={onViewLogs}>
                View diagnostic logs
              </Button>
            </Stack>
          </Alert>
        )}
        {reviewedBackup && (
          <>
            {!onRestore && (
              <Text id={restoreAvailabilityId} size="sm" c="dimmed">
                Restore is unavailable in this desktop build.
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                ref={cancelButton}
                variant="default"
                disabled={restoring}
                onClick={() => {
                  setError(null);
                  setReviewedBackup(null);
                }}
              >
                Cancel
              </Button>
              <Button
                color="red"
                disabled={!onRestore}
                loading={restoring}
                aria-describedby={onRestore ? undefined : restoreAvailabilityId}
                onClick={() => void confirmRestore()}
              >
                Confirm restore
              </Button>
            </Group>
          </>
        )}
        {!reviewedBackup && capturedAt && settings && (
          <Group justify="flex-end">
            <Button onClick={() => setReviewedBackup(capturedAt)}>Restore original settings</Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}
