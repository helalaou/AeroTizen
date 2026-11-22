const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const FileTimingsReporter = require("./reporters/file_timings.cjs");

for (const shard of [null, { current: 2, total: 3 }]) {
  test(`file timings include retries and identify ${shard ? "a shard" : "an unsharded run"}`, (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "aerotizen-browser-timings-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const printed = t.mock.method(console, "log", () => {});
    const reporter = new FileTimingsReporter({ outputFile: "results/timings.json" });
    reporter.onBegin({ configFile: path.join(root, "playwright.config.cjs"), shard });
    const retry = {
      id: "retry",
      location: { file: path.join(root, "tests/browser/retry.spec.cjs") },
      outcome: () => "flaky",
    };
    const failure = {
      id: "failure",
      location: { file: path.join(root, "tests/browser/other.spec.cjs") },
      outcome: () => "unexpected",
    };
    reporter.onTestEnd(retry, { duration: 1200, status: "failed" });
    reporter.onTestEnd(retry, { duration: 800, status: "passed" });
    reporter.onTestEnd(failure, { duration: 500, status: "timedOut" });
    reporter.onTestEnd({ ...failure, id: "skip", outcome: () => "skipped" }, { duration: 0, status: "skipped" });
    reporter.onEnd({ status: "failed", duration: 1500 });
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "results/timings.json"), "utf8")), {
      status: "failed",
      shard,
      wallTimeMs: 1500,
      totalTestTimeMs: 2500,
      files: [
        { file: "tests/browser/retry.spec.cjs", tests: 1, attempts: 2, unexpected: 0, skipped: 0, durationMs: 2000 },
        { file: "tests/browser/other.spec.cjs", tests: 2, attempts: 2, unexpected: 1, skipped: 1, durationMs: 500 },
      ],
    });
    const heading = shard ? "## Browser test timings (shard 2/3)" : "## Browser test timings\n";
    assert.ok(printed.mock.calls[0].arguments[0].includes(heading));
  });
}
