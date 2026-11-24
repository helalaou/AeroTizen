import { describe, expect, it } from "vitest";
import { createDesktopLog, formatDesktopLog, LOG_LIMIT } from "./desktopLogs";

describe("Desktop logs", () => {
  it("records only fixed operation names and error codes", async () => {
    const log = createDesktopLog();
    const nativeError = { code: "connection_failed", message: "Could not reach Private TV at 192.0.2.20" };
    const otherError = { code: "private-token", message: "owner@example.test" };

    await expect(log.track("connect", () => Promise.reject(nativeError))).rejects.toBe(nativeError);
    await expect(log.track("samsungSignIn", () => Promise.reject(otherError))).rejects.toBe(otherError);

    const entries = log.getSnapshot();
    expect(entries.map(({ outcome, code }) => [outcome, code])).toEqual([
      ["failed", "request_failed"],
      ["started", null],
      ["failed", "connection_failed"],
      ["started", null],
    ]);
    const text = formatDesktopLog(createDesktopLog().getSnapshot(), false);
    expect(text).toContain("connection_failed");
    expect(text).not.toMatch(/Private TV|192\.0\.2\.20|private-token|owner@example\.test/);
  });

  it("keeps the most recent entries across reload and separates the simulator history", () => {
    const log = createDesktopLog();
    for (let index = 0; index < LOG_LIMIT + 3; index++) log.recordOpened();

    const reloaded = createDesktopLog();
    expect(reloaded.getSnapshot()).toHaveLength(LOG_LIMIT);
    expect(reloaded.getSnapshot()[0]?.id).toBe(LOG_LIMIT + 3);
    expect(reloaded.getSnapshot().at(-1)?.id).toBe(4);
    expect(createDesktopLog(true).getSnapshot()).toEqual([]);
  });

  it("records an aborted request as cancelled even if the service returns a result", async () => {
    const log = createDesktopLog();
    const controller = new AbortController();
    await expect(
      log.track(
        "apps",
        async () => {
          controller.abort();
          return [];
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual([]);
    expect(log.getSnapshot()[0]).toMatchObject({ action: "apps", outcome: "cancelled", code: null });
  });
});
