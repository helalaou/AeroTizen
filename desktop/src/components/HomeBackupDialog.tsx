import { Alert, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { errorMessage } from "../contracts";
import type { DesktopService, HomeBackupSettings } from "../contracts";
import styles from "../styles.module.css";
import { autostartLabel, homeAppLabel } from "../tvDetails";

interface HomeBackupDialogProps {
  tvId: string;
  status: string;
  capturedAt?: string;
  readBackup?: DesktopService["readHomeBackup"];
  onClose: () => void;
}

export function HomeBackupDialog({ tvId, status, capturedAt, readBackup, onClose }: HomeBackupDialogProps) {
  const [settings, setSettings] = useState<HomeBackupSettings | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

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

  return (
    <Modal
      opened
      centered
      title="Original Home backup"
      onClose={onClose}
      closeButtonProps={{ "aria-label": "Close backup status" }}
    >
      <Stack gap="md">
        <Text size="sm">{status}</Text>
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
        {readError && (
          <Alert color="red" role="alert">
            {readError}
          </Alert>
        )}
      </Stack>
    </Modal>
  );
}
