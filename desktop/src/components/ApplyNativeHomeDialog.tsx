import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { showToast } from "../Toasts";

export type ApplyNativeHome = (reportError: (message: string) => void) => Promise<boolean>;

interface ApplyNativeHomeDialogProps {
  tvName: string;
  hasBackup: boolean;
  onApply: ApplyNativeHome;
  onClose: () => void;
  onViewLogs: () => void;
}

export function ApplyNativeHomeDialog({ tvName, hasBackup, onApply, onClose, onViewLogs }: ApplyNativeHomeDialogProps) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmApply() {
    if (applying) return;
    setApplying(true);
    setError(null);
    if (await onApply(setError)) {
      onClose();
      showToast("Home and startup settings updated.");
    } else {
      setApplying(false);
      setError((message) => message ?? "Could not change Home and startup settings. Try again.");
    }
  }

  return (
    <Modal
      opened
      centered
      title="Use AeroTizen for Home and startup?"
      onClose={onClose}
      withCloseButton={!applying}
      closeOnClickOutside={!applying}
      closeOnEscape={!applying}
      closeButtonProps={{ "aria-label": "Close Home setup" }}
    >
      <Stack gap="md" aria-busy={applying}>
        <Text size="sm">
          Set AeroTizen as the Home app and configure it to open at startup on <strong>{tvName}</strong>.
        </Text>
        <Text size="sm">
          {hasBackup
            ? "Your existing original backup will be kept."
            : "Your original Home and startup settings will be backed up before AeroTizen opens."}
        </Text>
        {error && (
          <Alert color="red" role="alert">
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{error}</Text>
              <Button size="xs" variant="default" onClick={onViewLogs}>
                View diagnostic logs
              </Button>
            </Stack>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" data-autofocus disabled={applying} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={applying} onClick={() => void confirmApply()}>
            Confirm setup
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
