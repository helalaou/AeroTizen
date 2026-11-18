import { useEffect, useRef, useState } from "react";
import { errorMessage } from "./contracts";
import type { SamsungAccount, SamsungService } from "./contracts";

export function useSamsungAccount(service: SamsungService | undefined) {
  const [account, setAccount] = useState<SamsungAccount | null>(null);
  const [loading, setLoading] = useState(Boolean(service));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const signingIn = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    if (service) {
      void service
        .account()
        .then(
          (saved) => {
            if (mounted.current) setAccount(saved);
          },
          () => {
            if (mounted.current) setError("Could not check your Samsung sign-in. Try signing in again.");
          },
        )
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    }
    return () => {
      mounted.current = false;
      signingIn.current?.abort();
    };
  }, [service]);

  async function signIn(signal: AbortSignal) {
    if (!service) throw new Error("Samsung sign-in is unavailable.");
    const controller = new AbortController();
    signingIn.current?.abort();
    signingIn.current = controller;
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) controller.abort();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await service.signIn(controller.signal);
      controller.signal.throwIfAborted();
      if (mounted.current) setAccount(signedIn);
      return signedIn;
    } finally {
      signal.removeEventListener("abort", cancel);
      if (signingIn.current === controller) {
        signingIn.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  async function signOut() {
    if (!service || busy) return;
    setBusy(true);
    setError(null);
    try {
      await service.signOut();
      if (mounted.current) setAccount(null);
    } catch (caught) {
      if (mounted.current) setError(errorMessage(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function refresh() {
    if (!service) return;
    const saved = await service.account();
    if (mounted.current) setAccount(saved);
  }

  return { account, loading, busy, error, signIn, signOut, refresh, clearError: () => setError(null) };
}
