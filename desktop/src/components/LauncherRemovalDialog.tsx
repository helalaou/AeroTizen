import { Alert, Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import type { DesktopService, LauncherRemovalReview, SavedTv } from "../contracts";
import { errorMessage } from "../contracts";

interface LauncherRemovalDialogProps {
  profile: SavedTv;
  review: DesktopService["reviewLauncherRemoval"];
  remove(revision: string, reportError: (message: string) => void): Promise<boolean>;
  onHome(): void;
  onRoot(): void;
  onClose(): void;
}

type ReviewState =
  | { status: "checking" }
  | { status: "ready"; review: LauncherRemovalReview }
  | { status: "blocked"; message: string; destination?: "home" | "root" };

function blocked(error: unknown): ReviewState {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const message = errorMessage(error);
  if (code === "launcher_home_assigned") return { status: "blocked", message, destination: "home" };
  if (code === "launcher_home_unverified") return { status: "blocked", message, destination: "root" };
  return { status: "blocked", message };
}

export function LauncherRemovalDialog({
  profile,
  review,
  remove,
  onHome,
  onRoot,
  onClose,
}: LauncherRemovalDialogProps) {
  const [state, setState] = useState<ReviewState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState(false);
  const id = profile.id;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void review(id, signal).then(
      (result) => {
        if (!signal.aborted) setState({ status: "ready", review: result });
      },
      (error: unknown) => {
        if (!signal.aborted) setState(blocked(error));
      },
    );
    return () => controller.abort();
  }, [id, review, attempt]);

  async function confirm() {
    if (state.status !== "ready" || removing) return;
    setRemoving(true);
    try {
      if (await remove(state.review.revision, (message) => setState({ status: "blocked", message }))) onClose();
    } finally {
      setRemoving(false);
    }
  }

  function retry() {
    setState({ status: "checking" });
    setAttempt((current) => current + 1);
  }

  return (
    <Modal
      opened
      centered
      title="Remove AeroTizen"
      onClose={onClose}
      closeOnClickOutside={!removing}
      closeOnEscape={!removing}
      withCloseButton={!removing}
    >
      <Stack>
        <Text size="sm">
          TV: <strong>{profile.name}</strong>
        </Text>
        {state.status === "checking" && (
          <Group role="status" gap="xs">
            <Loader size="xs" />
            <Text size="sm">Checking Home and startup…</Text>
          </Group>
        )}
        {state.status === "ready" && (
          <>
            <Text size="sm">The TV’s Home and startup settings are clear of AeroTizen.</Text>
            <Alert color="red" title={`Remove AeroTizen ${state.review.version}?`}>
              This deletes AeroTizen and its settings from this TV.
            </Alert>
          </>
        )}
        {state.status === "blocked" && (
          <Alert color="orange" role="alert" title="Removal blocked">
            {state.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={removing} onClick={onClose}>
            Cancel
          </Button>
          {state.status === "blocked" && state.destination === "home" && (
            <Button onClick={onHome}>Open Home and startup</Button>
          )}
          {state.status === "blocked" && state.destination === "root" && (
            <Button onClick={onRoot}>Open Root access</Button>
          )}
          {state.status === "blocked" && !state.destination && (
            <Button variant="default" onClick={retry}>
              Run checks again
            </Button>
          )}
          {state.status === "ready" && (
            <Button color="red" loading={removing} onClick={() => void confirm()}>
              Remove AeroTizen
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
