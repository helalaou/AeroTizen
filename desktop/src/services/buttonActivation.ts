import type { ButtonMappings, TvButtonMapping } from "../contracts";

export const BUTTON_ACTIVATION_RECHECK_MS = 1_000;
export const BUTTON_ACTIVATION_TIMEOUT_MS = 10_000;

export interface ButtonActivation {
  button: string;
  state: "checking" | "unconfirmed";
}

export function needsActivationCheck(mapping: Readonly<TvButtonMapping>): boolean {
  return mapping.mode !== "default" && !mapping.active;
}

function pause(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new DOMException("Button check cancelled.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, BUTTON_ACTIVATION_RECHECK_MS);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export async function checkButtonActivation(
  expected: Readonly<TvButtonMapping>,
  read: (signal: AbortSignal) => Promise<ButtonMappings>,
  signal: AbortSignal,
  onSnapshot: (mappings: ButtonMappings) => void,
): Promise<{ mappings: ButtonMappings | null; confirmed: boolean }> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const deadline = setTimeout(cancel, BUTTON_ACTIVATION_TIMEOUT_MS);
  let latest: ButtonMappings | null = null;
  try {
    while (true) {
      await pause(controller.signal);
      const snapshot = await read(controller.signal);
      controller.signal.throwIfAborted();
      latest = snapshot;
      onSnapshot(snapshot);
      if (snapshot.status !== "ready") break;
      const mapping = snapshot.buttons.find((row) => row.button === expected.button);
      if (!mapping || mapping.mode !== expected.mode || mapping.app_id !== expected.app_id) break;
      if (mapping.active) return { mappings: latest, confirmed: true };
    }
    return { mappings: latest, confirmed: false };
  } catch (error) {
    if (signal.aborted || !controller.signal.aborted) throw error;
    return { mappings: latest, confirmed: false };
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", cancel);
    controller.abort();
  }
}
