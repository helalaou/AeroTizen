// Synthetic desktop Chromium audit. CPU throttling does not emulate a TV.
/* global document, Element, KeyboardEvent, requestAnimationFrame, window */
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:8000/" },
    cpu: { type: "string", default: "4" },
    samples: { type: "string", default: "30" },
    output: { type: "string" },
  },
});
const rate = Number(values.cpu);
const count = Number(values.samples);
if (!Number.isFinite(rate) || rate < 1 || !Number.isInteger(count) || count < 2) {
  throw new Error("Use --cpu >= 1 and an integer --samples >= 2.");
}
const stats = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const settings of [
    { background: "aurora" },
    { background: "midnight" },
    { background: "midnight", showTime: false, dateFormat: "none", showWeather: false, showNetwork: false },
    { background: "aurora", performanceMode: true },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    const consoleMessages = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()) && consoleMessages.length < 50) {
        consoleMessages.push({ level: message.type(), text: message.text() });
      }
    });
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((settings) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["demo0", "demo1", "demo2", "demo3", "demo4", "demo5"], ...settings }),
      );
      window.audit = { intl: 0, geometry: 0 };
      Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
        construct(target, args) {
          window.audit.intl++;
          return Reflect.construct(target, args);
        },
      });
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        window.audit.geometry++;
        return rect.call(this);
      };
    }, settings);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await cdp.send("Performance.enable");
    const start = performance.now();
    await page.goto(values.url);
    await page.waitForFunction(
      () => window.AeroTizen?.apps.ready && document.querySelector("#grid [data-focused=true]"),
    );
    await page.evaluate(() => document.fonts.ready);
    const readyMs = performance.now() - start;
    const performanceModeActive = await page.evaluate(
      () => window.AeroTizen.settings.getSnapshot().performanceMode === true,
    );
    await page.waitForTimeout(800);
    await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize: retainedHeapBytes } = await cdp.send("Runtime.getHeapUsage");
    const { nodes: domNodes } = await cdp.send("Memory.getDOMCounters");
    const idleBefore = await cdp.send("Performance.getMetrics");
    await page.waitForTimeout(1000);
    const idleAfter = await cdp.send("Performance.getMetrics");
    const taskDuration = (result) => result.metrics.find(({ name }) => name === "TaskDuration").value;
    const idleTaskMs = (taskDuration(idleAfter) - taskDuration(idleBefore)) * 1000;
    const runs = [];
    for (const interval of [250, 50]) {
      const before = await cdp.send("Performance.getMetrics");
      const run = await page.evaluate(
        async ({ count, interval }) => {
          window.audit.intl = 0;
          window.audit.geometry = 0;
          const sync = [];
          const frames = [];
          const pending = [];
          const focused = new Set();
          for (let i = 0; i < count; i++) {
            const start = performance.now();
            const code = i % 2 ? 37 : 39;
            document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: code, which: code, bubbles: true }));
            sync.push(performance.now() - start);
            focused.add(document.querySelector("#grid [data-focused=true]")?.getAttribute("data-id"));
            pending.push(
              new Promise((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    frames.push(performance.now() - start);
                    resolve();
                  }),
                ),
              ),
            );
            await new Promise((resolve) => setTimeout(resolve, interval));
          }
          await Promise.all(pending);
          return { sync, frames, ...window.audit, focused: [...focused] };
        },
        { count, interval },
      );
      const after = await cdp.send("Performance.getMetrics");
      const previous = Object.fromEntries(before.metrics.map(({ name, value }) => [name, value]));
      const metrics = Object.fromEntries(
        after.metrics
          .filter(({ name }) =>
            [
              "LayoutCount",
              "LayoutDuration",
              "RecalcStyleCount",
              "RecalcStyleDuration",
              "ScriptDuration",
              "TaskDuration",
            ].includes(name),
          )
          .map(({ name, value }) => [name, value - previous[name]]),
      );
      if (run.focused.length !== 2 || run.focused.some((id) => typeof id !== "string"))
        throw new Error("Navigation did not move between two cards.");
      runs.push({
        interval,
        syncMs: stats(run.sync),
        twoFramesMs: stats(run.frames),
        intl: run.intl,
        geometry: run.geometry,
        metrics,
      });
    }
    results.push({
      settings,
      performanceModeActive,
      readyMs,
      retainedHeapBytes,
      domNodes,
      idleTaskMs,
      runs,
      errors,
      consoleMessages,
    });
    await page.close();
  }
  const output = JSON.stringify(
    { browser: browser.version(), cpuThrottle: rate, samplesPerRun: count, url: values.url, results },
    null,
    2,
  );
  if (values.output) await writeFile(values.output, output + "\n");
  console.log(output);
} finally {
  await browser.close();
}
