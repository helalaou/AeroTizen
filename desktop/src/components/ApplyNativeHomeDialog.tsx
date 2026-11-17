import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";

export type ApplyNativeHome = (reportError: (message: string) => void) => Promise<boolean>;

interface ApplyNativeHomeDialogProps {
  tvName: string;
  hasBackup: boolean;
  onApply: ApplyNativeHome;
  onClose: () => void;
}

export function ApplyNativeHomeDialog({ tvName, hasBackup, onApply, onClose }: ApplyNativeHomeDialogProps) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmApply() {
    if (applying) return;
    setApplying(true);
    setError(null);
    if (await onApply(setError)) {
      onClose();
    } else {
      setApplying(false);
      setError((message) => message ?? "Could not start Native Home setup. Try again.");
    }
  }

  return (
    <Modal
      opened
      centered
      title="Apply Native Home?"
      onClose={onClose}
      withCloseButton={!applying}
      closeOnClickOutside={!applying}
      closeOnEscape={!applying}
      closeButtonProps={{ "aria-label": "Close Native Home setup" }}
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
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" data-autofocus disabled={applying} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={applying} onClick={() => void confirmApply()}>
            Confirm apply
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
