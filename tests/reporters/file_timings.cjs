const { appendFileSync, mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const MILLISECONDS_PER_SECOND = 1000;
const seconds = (durationMs) => (durationMs / MILLISECONDS_PER_SECOND).toFixed(2);

class FileTimingsReporter {
  constructor({ outputFile = "test-results/browser-file-timings.json" } = {}) {
    this.outputFile = outputFile;
    this.files = new Map();
    this.root = process.cwd();
    this.shard = null;
  }

  onBegin(config) {
    if (config.configFile) this.root = path.dirname(config.configFile);
    this.shard = config.shard ?? null;
  }

  onTestEnd(test, result) {
    const filename = path.relative(this.root, test.location.file).split(path.sep).join("/");
    const file = this.files.get(filename) ?? { durationMs: 0, attempts: 0, tests: new Map() };
    file.durationMs += result.duration;
    file.attempts++;
    file.tests.set(test.id, { outcome: test.outcome(), status: result.status });
    this.files.set(filename, file);
  }

  onEnd(result) {
    const files = [...this.files].map(([file, timing]) => ({
      file,
      tests: timing.tests.size,
      attempts: timing.attempts,
      unexpected: [...timing.tests.values()].filter((test) => test.outcome === "unexpected").length,
      skipped: [...timing.tests.values()].filter((test) => test.status === "skipped").length,
      durationMs: timing.durationMs,
    }));
    files.sort((a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file));
    const report = {
      status: result.status,
      shard: this.shard,
      wallTimeMs: result.duration,
      totalTestTimeMs: files.reduce((total, file) => total + file.durationMs, 0),
      files,
    };
    const output = path.resolve(this.root, this.outputFile);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    const rows = files.map(
      (file) =>
        `| ${file.file} | ${file.tests} | ${file.attempts} | ${file.unexpected} | ${seconds(file.durationMs)} |`,
    );
    const summary = [
      "## Browser test timings" + (this.shard ? ` (shard ${this.shard.current}/${this.shard.total})` : ""),
      "",
      `Wall time: ${seconds(report.wallTimeMs)}s. File times sum test execution across workers, including retries; they are not wall times.`,
      "",
      "| File | Tests | Attempts | Unexpected | Execution seconds |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...rows,
      "",
    ].join("\n");
    console.log("\n" + summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
    }
  }
}

module.exports = FileTimingsReporter;
