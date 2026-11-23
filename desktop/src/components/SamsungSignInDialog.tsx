import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../contracts";

interface SamsungSignInDialogProps {
  signedIn: boolean;
  tvName?: string;
  appName?: string;
  signIn(signal: AbortSignal): Promise<unknown>;
  prepareCertificates?(reportError: (message: string) => void): Promise<boolean>;
  install?(reportError: (message: string) => void): Promise<boolean>;
  onComplete(success: boolean): void;
}

export function SamsungSignInDialog({
  signedIn,
  tvName,
  appName = "AeroTizen",
  signIn,
  prepareCertificates,
  install,
  onComplete,
}: SamsungSignInDialogProps) {
  const [phase, setPhase] = useState<"idle" | "signing_in" | "certificates" | "installing">("idle");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const cancellable = phase === "idle" || phase === "signing_in";
  const pending = phase !== "idle";

  useEffect(() => () => request.current?.abort(), []);

  function close() {
    request.current?.abort();
    onComplete(false);
  }

  async function proceed() {
    if (pending) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    try {
      if (!signedIn) {
        setPhase("signing_in");
        await signIn(controller.signal);
      }
      controller.signal.throwIfAborted();
      if (prepareCertificates && install) {
        setPhase("certificates");
        if (!(await prepareCertificates(setError))) {
          setPhase("idle");
          return;
        }
        setPhase("installing");
        if (!(await install(setError))) {
          setError((current) => current ?? "Installation could not be verified. Refresh the TV and try again.");
          setPhase("idle");
          return;
        }
      }
      onComplete(true);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(errorMessage(caught));
        setPhase("idle");
      }
    }
  }

  return (
    <Modal
      opened
      centered
      title={tvName ? `Set up ${tvName}` : "Samsung sign-in"}
      onClose={close}
      closeOnClickOutside={cancellable}
      closeOnEscape={cancellable}
      withCloseButton={cancellable}
    >
      <Stack gap="md" aria-busy={pending}>
        {phase === "idle" && (
          <Text size="sm">
            {tvName
              ? `We'll prepare the signing certificates for ${tvName}, then install ${appName}.`
              : "Sign in to your Samsung account in your browser."}
          </Text>
        )}
        {phase === "signing_in" && (
          <Text role="status" size="sm">
            Complete Samsung sign-in in your browser. This window will update when you finish.
          </Text>
        )}
        {phase === "certificates" && (
          <Text role="status" size="sm">
            Creating signing certificates for {tvName}…
          </Text>
        )}
        {phase === "installing" && (
          <Text role="status" size="sm">
            Installing {appName} on {tvName}…
          </Text>
        )}
        {error && (
          <Alert role="alert" color="red">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={!cancellable} onClick={close}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void proceed()}>
            {signedIn ? "Continue" : "Sign in with Samsung"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
