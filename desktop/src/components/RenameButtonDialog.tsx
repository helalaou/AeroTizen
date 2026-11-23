import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import type { ButtonInventoryChange } from "../contracts";
import { buttonNameExists, MAX_BUTTON_NAME_LENGTH, validButtonName } from "../services/buttonNames";

interface RenameButtonDialogProps {
  button: string;
  buttonNames: readonly string[];
  onSubmit(change: ButtonInventoryChange, reportError: (message: string) => void): Promise<boolean>;
  onClose(): void;
}

export function RenameButtonDialog({ button, buttonNames, onSubmit, onClose }: RenameButtonDialogProps) {
  const [name, setName] = useState(button);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replacement = name.trim();
  const duplicate = buttonNameExists(replacement, buttonNames, button);
  const invalid = !validButtonName(replacement) || duplicate || replacement === button;

  async function submit() {
    if (invalid || pending) return;
    setPending(true);
    setError(null);
    if (await onSubmit({ action: "rename", button, new_name: replacement }, setError)) onClose();
    else setPending(false);
  }

  return (
    <Modal
      opened
      centered
      title={`Rename ${button}`}
      onClose={onClose}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Stack gap="md">
          <TextInput
            data-autofocus
            label="Button name"
            value={name}
            maxLength={MAX_BUTTON_NAME_LENGTH}
            disabled={pending}
            onChange={(event) => setName(event.currentTarget.value)}
            error={duplicate ? "A button already has this name." : undefined}
          />
          <Text size="sm">This saves the name on your TV and keeps the button's assigned action.</Text>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={invalid}>
              Save name
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
