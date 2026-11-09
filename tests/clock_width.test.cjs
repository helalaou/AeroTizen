const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createClockService } = loadTypeScript("launcher/src/services/createClockService.ts");

const harness = (locale = "en-GB") => {
  const pending = new Map();
  let id = 0;
  let time = 0;
  const clock = createClockService({
    platform: {
      getLocales: () => [locale],
      getDatePattern: () => "",
      getTimePattern: () => "",
      dateTimeFormat: (locales, options) => new Intl.DateTimeFormat(locales, options),
    },
    now: () => time,
    timers: {
      setInterval: () => 0,
      setTimeout(callback) {
        pending.set(++id, callback);
        return id;
      },
      clearTimeout: (timer) => pending.delete(timer),
    },
  });
  const run = () => {
    const [id, callback] = pending.entries().next().value;
    pending.delete(id);
    callback();
  };
  return { clock, pending, run, advance: (ms) => (time += ms) };
};

// Deliberately non-additive text widths: a sizing shortcut must not miss a wide time.
const measure = (text) => text.length * 11.3 + (text.includes("59") ? 19.7 : 0);
const exhaustive = (clock, format) => {
  let width = measure("0") * (format === "24" ? 5 : 8);
  const sample = new Date(2000, 0, 1);
  for (let minute = 0; minute < 1440; minute++) {
    sample.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    width = Math.max(width, measure(clock.formatTime(sample, format)) + 1);
  }
  return Math.ceil(width);
};

for (const locale of [
  "en-GB",
  "en-US",
  "ar-EG-u-nu-arab",
  "fa-IR",
  "fr-FR",
  "it-IT",
  "ru-RU",
  "pt-BR",
  "ko-KR",
  "ja-JP",
]) {
  for (const format of ["12", "24"]) {
    test(`${locale} ${format}-hour batches preserve the exact exhaustive width`, () => {
      const { clock, pending, run } = harness(locale);
      const expected = exhaustive(clock, format);
      const widths = [];
      let calls = 0;
      clock.measureTimeDeferred(
        format,
        "font",
        (text) => {
          calls++;
          return measure(text);
        },
        (width) => widths.push(width),
      );
      assert.equal(calls, 1, "startup only measures the minimum width");
      while (pending.size) {
        const before = calls;
        run();
        assert.ok(calls - before <= 60, "one task cannot scan the whole day");
      }
      assert.equal(calls, 1441);
      assert.equal(widths.at(-1), expected);
      clock.measureTimeDeferred(
        format,
        "font",
        () => assert.fail("cached width must not be measured again"),
        (width) => assert.equal(width, expected),
      );
      assert.equal(pending.size, 0);
      assert.equal(
        clock.measureTime(format, "font", () => assert.fail("sync readers share the cache")),
        expected,
      );
    });
  }
}

test("width batches yield when their time budget is used", () => {
  const { clock, pending, run, advance } = harness();
  let calls = 0;
  const cancel = clock.measureTimeDeferred(
    "24",
    "font",
    (text) => {
      calls++;
      advance(2);
      return measure(text);
    },
    () => undefined,
  );
  const before = calls;
  run();
  assert.equal(calls - before, 2);
  cancel();
  assert.equal(pending.size, 0);
});

test("cancelled width scans cannot publish or cache a partial result", () => {
  const { clock, pending, run } = harness();
  const widths = [];
  const cancel = clock.measureTimeDeferred("24", "font", measure, (width) => widths.push(width));
  run();
  cancel();
  assert.equal(pending.size, 0);
  assert.equal(widths.length, 1, "only the initial minimum was published");
  let calls = 0;
  assert.equal(
    clock.measureTime("24", "font", (text) => {
      calls++;
      return measure(text);
    }),
    exhaustive(clock, "24"),
  );
  assert.equal(calls, 1441, "a cancelled scan does not leave a false cache hit");
});
