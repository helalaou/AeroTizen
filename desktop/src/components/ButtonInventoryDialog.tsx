import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import type { ButtonInventoryChange } from "../contracts";

const MAX_BUTTON_NAME_LENGTH = 48;

interface ButtonInventoryDialogProps {
  action: ButtonInventoryChange["action"];
  tvName: string;
  buttonNames: string[];
  onSubmit(change: ButtonInventoryChange, reportError: (message: string) => void): Promise<boolean>;
  onClose(): void;
}

export function ButtonInventoryDialog({ action, tvName, buttonNames, onSubmit, onClose }: ButtonInventoryDialogProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const learning = action === "learn";
  const button = name.trim();
  const duplicate = buttonNames.some((existing) => existing.toLowerCase() === button.toLowerCase());
  const invalid = learning && (!button || duplicate || button.length > MAX_BUTTON_NAME_LENGTH);

  async function submit() {
    if (invalid || submitting) return;
    setSubmitting(true);
    setError(null);
    if (await onSubmit(learning ? { action: "learn", button } : { action: "reset" }, setError)) {
      onClose();
    } else {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened
      centered
      title={learning ? "Learn a button" : "Reset all buttons?"}
      onClose={onClose}
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      withCloseButton={!submitting}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Stack gap="md">
          {learning ? (
            <>
              <TextInput
                data-autofocus
                label="Button name"
                placeholder="e.g. Streaming"
                value={name}
                maxLength={MAX_BUTTON_NAME_LENGTH}
                onChange={(event) => setName(event.currentTarget.value)}
                error={duplicate ? "A button already has this name." : undefined}
                disabled={submitting}
              />
              {submitting ? (
                <Text role="status" size="sm">
                  Press the <strong>{button}</strong> button on your TV remote once.
                </Text>
              ) : (
                <Text size="sm">Use a dedicated app button. Press it when prompted.</Text>
              )}
            </>
          ) : (
            <Text size="sm">
              This restores the original actions for all app buttons on <strong>{tvName}</strong> and forgets any
              buttons you learned manually.
            </Text>
          )}
          {error && (
            <Alert role="alert" color="red">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              type="button"
              variant="default"
              data-autofocus={!learning || undefined}
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" color={learning ? undefined : "red"} disabled={invalid} loading={submitting}>
              {learning ? "Start learning" : "Reset all buttons"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
