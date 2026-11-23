import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonMappings, TvButtonMapping } from "../contracts";
import {
  BUTTON_ACTIVATION_RECHECK_MS,
  BUTTON_ACTIVATION_TIMEOUT_MS,
  checkButtonActivation,
  needsActivationCheck,
} from "./buttonActivation";

const saved: TvButtonMapping = {
  button: "Netflix",
  mode: "app",
  app_id: "test.Player",
  app_name: "Player",
  active: false,
};
const snapshot = (mapping: TvButtonMapping): ButtonMappings => ({
  status: "ready",
  buttons: [mapping],
  discovery_detail: null,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Button activation checks", () => {
  it("publishes live snapshots until the saved assignment is active and releases its timers", async () => {
    const pending = snapshot(saved);
    const active = snapshot({ ...saved, active: true });
    const read = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(active);
    const progress = vi.fn();
    const result = checkButtonActivation(saved, read, new AbortController().signal, progress);
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_RECHECK_MS);
    expect(progress).toHaveBeenLastCalledWith(pending);
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_RECHECK_MS);
    expect(await result).toEqual({ mappings: active, confirmed: true });
    expect(progress).toHaveBeenLastCalledWith(active);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops after the deadline while keeping the latest unconfirmed snapshot", async () => {
    const pending = snapshot(saved);
    const read = vi.fn().mockResolvedValue(pending);
    const result = checkButtonActivation(saved, read, new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_TIMEOUT_MS);
    expect(await result).toEqual({ mappings: pending, confirmed: false });
    const calls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_TIMEOUT_MS);
    expect(read).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an active read at the deadline without claiming activation", async () => {
    let querySignal: AbortSignal | undefined;
    const read = vi.fn(
      (signal: AbortSignal) =>
        new Promise<ButtonMappings>((_resolve, reject) => {
          querySignal = signal;
          signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
        }),
    );
    const result = checkButtonActivation(saved, read, new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_TIMEOUT_MS);
    expect(querySignal?.aborted).toBe(true);
    expect(await result).toEqual({ mappings: null, confirmed: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels while waiting and ignores a late reply from a cancelled read", async () => {
    const waiting = new AbortController();
    const unusedRead = vi.fn();
    const wait = checkButtonActivation(saved, unusedRead, waiting.signal, vi.fn());
    const cancelledWait = expect(wait).rejects.toHaveProperty("name", "AbortError");
    waiting.abort();
    await cancelledWait;
    expect(unusedRead).not.toHaveBeenCalled();

    const parent = new AbortController();
    let finish!: (value: ButtonMappings) => void;
    const read = vi.fn(
      () =>
        new Promise<ButtonMappings>((resolve) => {
          finish = resolve;
        }),
    );
    const progress = vi.fn();
    const result = checkButtonActivation(saved, read, parent.signal, progress);
    const cancelled = expect(result).rejects.toHaveProperty("name", "AbortError");
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_RECHECK_MS);
    parent.abort();
    finish(snapshot({ ...saved, active: true }));
    await cancelled;
    expect(progress).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not confirm a different assignment or hide a read failure", async () => {
    const other = snapshot({ ...saved, app_id: "other.App", active: true });
    const result = checkButtonActivation(
      saved,
      vi.fn().mockResolvedValue(other),
      new AbortController().signal,
      vi.fn(),
    );
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_RECHECK_MS);
    expect(await result).toEqual({ mappings: other, confirmed: false });
    const failed = checkButtonActivation(
      saved,
      vi.fn().mockRejectedValue(new Error("Offline")),
      new AbortController().signal,
      vi.fn(),
    );
    const error = expect(failed).rejects.toThrow("Offline");
    await vi.advanceTimersByTimeAsync(BUTTON_ACTIVATION_RECHECK_MS);
    await error;
    expect(needsActivationCheck({ ...saved, mode: "default", app_id: null })).toBe(false);
    expect(needsActivationCheck({ ...saved, active: true })).toBe(false);
    expect(needsActivationCheck(saved)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
