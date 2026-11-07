import { within } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";

import { mountToast } from "./mountToast";

afterEach(() => vi.useRealTimers());

test("showing the same toast again restarts its dismissal timer", ({ onTestFinished }) => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  const { bridge, dispose } = mountToast(host);
  onTestFinished(dispose);
  const toast = within(host);
  const message = "Would open YouTube";

  expect(host.querySelector("#toast")?.hasAttribute("hidden")).toBe(true);
  bridge.toast(message);
  expect(toast.getByText(message).hidden).toBe(false);

  vi.advanceTimersByTime(1500);
  bridge.toast(message);
  vi.advanceTimersByTime(1500);
  expect(toast.getByText(message).hidden).toBe(false);

  vi.advanceTimersByTime(1100);
  expect(host.querySelector("#toast")?.hasAttribute("hidden")).toBe(true);
});
