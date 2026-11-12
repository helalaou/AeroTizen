const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { installClock } = require("./helpers/clock.cjs");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { installSettings } = require("./helpers/settings.cjs");
const { launcherConfig } = loadTypeScript("launcher/src/launcherConfig.ts");

function runtime({ locale = "en-GB", time, intl = Intl, saved = {}, now } = {}) {
  const storage = new Map([["aerotizen.settings.v1", JSON.stringify(saved)]]);
  const A = { config: launcherConfig };
  const timers = [];
  const context = vm.createContext({
    window: {
      AeroTizen: A,
      navigator: { languages: [locale], language: locale },
      Intl: intl,
      tizen: time ? { time } : undefined,
    },
    setInterval: (tick, delay) => timers.push({ tick, delay }),
    AeroTizen: A,
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  });
  installClock(context, now);
  installSettings(context);
  A.settings.load();
  return { A, storage, timers };
}

const sample = new Date(2026, 9, 21, 17, 4);

test("new settings follow local UK, US, and German date and time conventions", () => {
  for (const [locale, date, time, format] of [
    ["en-GB", "Wed 21 Oct", "17:04", "24"],
    ["en-US", "Wed, Oct 21", "5:04 PM", "12"],
    ["de-DE", "Mi., 21. Okt.", "17:04", "24"],
  ]) {
    const { A } = runtime({ locale });
    assert.equal(A.settings.getSnapshot().dateFormat, "short");
    assert.equal(A.settings.getSnapshot().timeFormat, format);
    assert.equal(A.clock.formatDate(sample, A.settings.getSnapshot().dateFormat), date);
    assert.equal(A.clock.formatTime(sample, A.settings.getSnapshot().timeFormat), time);
  }
});

test("numeric dates follow TV changes while the selected time format stays saved", () => {
  let datePattern = "d/m/y",
    timePattern = "h:m:s";
  const { A } = runtime({
    locale: "en-US",
    time: {
      getDateFormat: (short) => {
        assert.equal(short, true);
        return datePattern;
      },
      getTimeFormat: () => timePattern,
    },
  });
  assert.equal(A.clock.formatDate(sample, "numeric"), "21/10/2026");
  assert.equal(A.clock.formatDate(sample, "numeric-short"), "21/10");
  assert.equal(A.settings.getSnapshot().timeFormat, "24");
  assert.equal(A.clock.formatTime(sample, A.settings.getSnapshot().timeFormat), "17:04");
  datePattern = "y-m-d";
  timePattern = "h:m:s ap";
  assert.equal(A.clock.formatDate(sample, "numeric"), "2026-10-21");
  assert.equal(A.clock.formatDate(sample, "numeric-short"), "10-21");
  assert.equal(A.clock.defaultTimeFormat(), "12");
  A.settings.load();
  assert.equal(A.settings.getSnapshot().timeFormat, "24");
  assert.equal(A.clock.formatTime(sample, A.settings.getSnapshot().timeFormat), "17:04");
});

test("unavailable or unsupported TV formats fall back to the browser locale", () => {
  for (const time of [
    {},
    {
      getDateFormat: () => {
        throw Error("Unavailable");
      },
      getTimeFormat: () => {
        throw Error("Unavailable");
      },
    },
    { getDateFormat: () => null, getTimeFormat: () => null },
    { getDateFormat: () => "unsupported", getTimeFormat: () => "unsupported" },
  ]) {
    const { A } = runtime({ time });
    assert.equal(A.clock.formatDate(sample, "numeric"), "21/10/2026");
    assert.equal(A.clock.formatDate(sample, "numeric-short"), "21/10");
    assert.equal(A.clock.formatTime(sample, A.settings.getSnapshot().timeFormat), "17:04");
  }
});

test("manual choices survive reload, including hiding the date", () => {
  const { A, storage } = runtime({
    saved: { dateFormat: "none", timeFormat: "12" },
  });
  assert.equal(A.settings.getSnapshot().dateFormat, "none");
  assert.equal(A.settings.getSnapshot().timeFormat, "12");
  assert.equal(A.clock.formatTime(sample, "12"), "5:04 pm");
  assert.equal(A.clock.formatDate(sample, "numeric"), "21/10/2026");
  assert.equal(A.clock.formatDate(sample, "short"), "Wed 21 Oct");
  A.clock.tick();
  A.settings.update({ dateFormat: "numeric-short" });
  A.settings.update({ timeFormat: "24" });

  const saved = JSON.parse(storage.get(A.config.STORAGE_KEY));
  assert.equal(saved.dateFormat, "numeric-short");
  assert.equal(saved.timeFormat, "24");
  A.settings.load();
  A.clock.tick();
  assert.equal(A.settings.getSnapshot().dateFormat, "numeric-short");
  assert.equal(A.settings.getSnapshot().timeFormat, "24");
});

test("older runtimes without Intl still show a date and time", () => {
  const { A } = runtime({ intl: null });
  assert.equal(A.clock.formatDate(sample, "short"), "Wed, 21 Oct");
  assert.equal(A.clock.formatDate(sample, "numeric"), "21/10/2026");
  assert.equal(A.clock.formatDate(sample, "numeric-short"), "21/10");
  assert.equal(A.settings.getSnapshot().timeFormat, "12");
  assert.equal(A.clock.formatTime(sample, A.settings.getSnapshot().timeFormat), "5:04 pm");
});

test("readable date styles use local names, order, and punctuation", () => {
  for (const [locale, compact, short, long] of [
    ["en-GB", "21 Oct", "Wed 21 Oct", "Wednesday 21 October"],
    ["en-US", "Oct 21", "Wed, Oct 21", "Wednesday, October 21"],
    ["de-DE", "21. Okt.", "Mi., 21. Okt.", "Mittwoch, 21. Oktober"],
    ["fr-FR", "21 oct.", "mer. 21 oct.", "mercredi 21 octobre"],
    ["ja-JP", "10月21日", "10月21日(水)", "10月21日水曜日"],
  ]) {
    const { A } = runtime({ locale });
    assert.equal(A.clock.formatDate(sample, "compact"), compact);
    assert.equal(A.clock.formatDate(sample, "short"), short);
    assert.equal(A.clock.formatDate(sample, "long"), long);
    assert.equal(A.clock.formatDate(sample, "iso"), "2026-10-21");
  }
});

test("unknown date styles use the current default", () => {
  for (const dateFormat of ["auto", "weekday", "dmy", "mdy", "invalid", null]) {
    const { A } = runtime({ saved: { dateFormat } });
    assert.equal(A.settings.getSnapshot().dateFormat, "short");
    assert.equal(A.clock.formatDate(sample, A.settings.getSnapshot().dateFormat), "Wed 21 Oct");
  }
});

test("readable fallback dates keep the TV month-first order without Intl", () => {
  const { A } = runtime({ intl: null, time: { getDateFormat: () => "m/d/y" } });
  assert.equal(A.clock.formatDate(sample, "compact"), "Oct 21");
  assert.equal(A.clock.formatDate(sample, "short"), "Wed, Oct 21");
  assert.equal(A.clock.formatDate(sample, "long"), "Wednesday, October 21");
});

test("short numeric dates omit the year and keep local order and separators", () => {
  for (const [locale, date] of [
    ["en-GB", "21/10"],
    ["en-US", "10/21"],
    ["de-DE", "21.10."],
    ["fr-FR", "21/10"],
    ["ja-JP", "10/21"],
  ]) {
    const { A } = runtime({ locale });
    assert.equal(A.clock.formatDate(sample, "numeric-short"), date);
  }
  for (const [pattern, date] of [
    ["d/m/y", "21/10"],
    ["m/d/y", "10/21"],
    ["y-m-d", "10-21"],
    ["y-d-m", "21-10"],
    ["dd.mm.yyyy", "21.10"],
    ["d-y-m", "21-10"],
  ]) {
    const { A } = runtime({ intl: null, time: { getDateFormat: () => pattern } });
    assert.equal(A.clock.formatDate(sample, "numeric-short"), date);
  }
});

test("TV numeric patterns preserve local digits and calendar dates", () => {
  for (const [locale, full, short] of [
    ["ar-EG", "٢١/١٠/٢٠٢٦", "٢١/١٠"],
    ["fa-IR", "۱۴۰۵/۰۷/۲۹", "۰۷/۲۹"],
    ["th-TH", "21/10/2569", "21/10"],
  ]) {
    const { A } = runtime({ locale, time: { getDateFormat: () => "d/m/y" } });
    assert.equal(A.clock.formatDate(sample, "numeric"), full);
    assert.equal(A.clock.formatDate(sample, "numeric-short"), short);
  }
});

test("older Intl implementations without formatToParts keep dates localised", () => {
  const intl = {
    DateTimeFormat: function (locales, options) {
      const formatter = new Intl.DateTimeFormat(locales, options);
      return { format: formatter.format };
    },
  };
  const { A } = runtime({ locale: "fa-IR", intl, time: { getDateFormat: () => "d/m/y" } });
  assert.equal(A.clock.formatDate(sample, "numeric"), "۱۴۰۵/۰۷/۲۹");
  assert.equal(A.clock.formatDate(sample, "numeric-short"), "۰۷/۲۹");
});

test("TV patterns do not strip required calendar eras", () => {
  const japanese = runtime({
    locale: "ja-JP-u-ca-japanese",
    time: { getDateFormat: () => "d/m/y" },
  });
  assert.equal(japanese.A.clock.formatDate(sample, "numeric"), "R8/10/21");
  const islamic = runtime({
    locale: "ar-SA-u-ca-islamic-umalqura",
    time: { getDateFormat: () => "d/m/y" },
  });
  assert.match(islamic.A.clock.formatDate(sample, "numeric"), /١٤٤٨.*هـ$/);
});

test("initial time selection uses the device setting before the browser locale", () => {
  for (const [locale, pattern, expected] of [
    ["en-US", "h:m:s", "24"],
    ["en-GB", "h:m:s ap", "12"],
  ]) {
    const { A, storage } = runtime({ locale, time: { getTimeFormat: () => pattern } });
    assert.equal(A.settings.getSnapshot().timeFormat, expected);
    assert.equal(JSON.parse(storage.get(A.config.STORAGE_KEY)).timeFormat, expected);
  }
});

test("invalid time formats use the device default and persist", () => {
  for (const previous of ["auto", null, "invalid"]) {
    const { A, storage } = runtime({ locale: "en-GB", saved: { timeFormat: previous } });
    assert.equal(A.settings.getSnapshot().timeFormat, "24");
    assert.equal(JSON.parse(storage.get(A.config.STORAGE_KEY)).timeFormat, "24");
  }
});

test("saved manual time choices override the device default", () => {
  for (const [saved, pattern] of [
    ["12", "h:m:s"],
    ["24", "h:m:s ap"],
  ]) {
    const { A } = runtime({ saved: { timeFormat: saved }, time: { getTimeFormat: () => pattern } });
    assert.equal(A.settings.getSnapshot().timeFormat, saved);
    A.settings.load();
    assert.equal(A.settings.getSnapshot().timeFormat, saved);
  }
});

test("both time choices keep local digits and day periods", () => {
  const arabic = runtime({ locale: "ar-EG" });
  assert.equal(arabic.A.settings.getSnapshot().timeFormat, "12");
  assert.equal(arabic.A.clock.formatTime(sample, "12"), "٥:٠٤ م");
  assert.equal(arabic.A.clock.formatTime(sample, "24"), "١٧:٠٤");
  const persian = runtime({ locale: "fa-IR" });
  assert.equal(persian.A.settings.getSnapshot().timeFormat, "24");
  assert.equal(persian.A.clock.formatTime(sample, "24"), "۱۷:۰۴");
});

test("time choices handle midnight and noon explicitly", () => {
  const { A } = runtime({ locale: "en-US" });
  const midnight = new Date(2026, 9, 21, 0, 4),
    noon = new Date(2026, 9, 21, 12, 4);
  assert.equal(A.clock.formatTime(midnight, "12"), "12:04 AM");
  assert.equal(A.clock.formatTime(midnight, "24"), "00:04");
  assert.equal(A.clock.formatTime(noon, "12"), "12:04 PM");
  assert.equal(A.clock.formatTime(noon, "24"), "12:04");
});

test("device detection still works without Intl", () => {
  const { A } = runtime({ intl: null, time: { getTimeFormat: () => "h:m:s" } });
  assert.equal(A.settings.getSnapshot().timeFormat, "24");
  assert.equal(A.clock.formatTime(sample, A.settings.getSnapshot().timeFormat), "17:04");
});

test("clock output follows a changed system time zone without reloading", () => {
  let timeZone = "Europe/London";
  const intl = {
    DateTimeFormat: function (locale, options) {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone });
    },
  };
  const { A } = runtime({ intl });
  const instant = new Date("2026-01-01T13:00:00Z");
  assert.equal(A.clock.formatTime(instant, "24"), "13:00");
  timeZone = "Asia/Tokyo";
  A.clock.tick();
  assert.equal(A.clock.formatTime(instant, "24"), "22:00");
});

test("clock formatters are reused until the next tick", () => {
  let constructors = 0;
  const intl = {
    DateTimeFormat: function (locales, options) {
      constructors++;
      return new Intl.DateTimeFormat(locales, options);
    },
  };
  const { A } = runtime({ intl });
  const format = () => {
    A.clock.defaultTimeFormat();
    A.clock.formatTime(sample, "24");
    A.clock.formatTimeParts(sample, "24");
    A.clock.formatDate(sample, "short");
  };
  format();
  const warmed = constructors;
  A.clock.start();
  format();
  assert.equal(constructors, warmed, "boot retains formatters from the first render");
  for (let i = 0; i < 30; i++) format();
  assert.equal(constructors, warmed);
  A.clock.tick();
  format();
  assert.equal(constructors, warmed + 3);
});

test("older Intl keeps a cached clock width without repeated measurement", () => {
  let constructors = 0;
  let measurements = 0;
  const intl = {
    DateTimeFormat: function () {
      constructors++;
      return { resolvedOptions: () => ({ hour12: false }), format: () => "date" };
    },
  };
  const { A } = runtime({ intl });
  const font = "700 36px Arial";
  const measure = (text) => {
    measurements++;
    return text.length * 10;
  };
  const initialConstructors = constructors;
  const width = A.clock.measureTime("24", font, measure);
  assert.ok(width >= A.clock.formatTime(sample, "24").length * 10);
  assert.ok(
    constructors - initialConstructors < 8,
    "unsupported hourCycle must not create a formatter for each minute",
  );
  const measured = measurements;
  A.clock.tick();
  assert.equal(A.clock.measureTime("24", font, measure), width);
  assert.equal(measurements, measured, "normal clock updates reuse the reserved width");
});

test("clock tick listeners are notified once and can unsubscribe", () => {
  const { A } = runtime();
  let ticks = 0;
  const unsubscribe = A.clock.subscribe(() => ticks++);
  A.clock.tick();
  assert.equal(ticks, 1);
  unsubscribe();
  A.clock.tick();
  assert.equal(ticks, 1);
});

test("custom clock fields preserve locale digits, separators and leading day periods", () => {
  for (const [locale, format, hour, minute, prefix] of [
    ["fi-FI", "24", "17", "04", false],
    ["ko-KR", "12", "5", "04", true],
    ["ar-EG-u-nu-arab", "12", "٥", "٠٤", false],
  ]) {
    const { A } = runtime({ locale });
    const fields = A.clock.formatTimeParts(sample, format);
    assert.equal(fields.hour, hour);
    assert.equal(fields.minute, minute);
    if (format === "12") {
      assert.ok(fields.dayPeriod);
    } else {
      assert.equal(fields.dayPeriod, "");
    }
    // ICU editions may spell a period differently; preserve what the shared
    // formatter actually supplied, including its locale-specific ordering.
    const compact = A.clock.formatTime(sample, format).replace(/[\s.:：\u200e\u200f\u061c]/g, "");
    assert.equal(compact, prefix ? fields.dayPeriod + hour + minute : hour + minute + fields.dayPeriod);
  }
  const { A } = runtime({ intl: {} });
  assert.equal(A.clock.formatTimeParts(sample, "24"), null);
  assert.equal(A.clock.formatTime(sample, "24"), "17:04");
});

test("clock publication does not query view hosts and starts one shared timer", () => {
  const { A, timers } = runtime({ now: () => sample.getTime() });
  A.$ = () => {
    throw new Error("Clock publication must not query DOM hosts");
  };
  let updates = 0;
  const unsubscribe = A.clock.subscribe(() => updates++);
  const initial = A.clock.getSnapshot();
  assert.equal(typeof initial, "number");
  assert.equal(A.clock.getSnapshot(), initial);
  A.clock.start();
  A.clock.start();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 10_000);
  assert.equal(updates, 1);
  timers[0].tick();
  A.clock.tick();
  assert.equal(updates, 3, "manual and scheduled ticks publish even when the timestamp matches");
  unsubscribe();
  A.clock.tick();
  assert.equal(updates, 3);
});
