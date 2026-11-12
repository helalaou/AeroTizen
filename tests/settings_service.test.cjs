const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createSettingsService } = loadTypeScript("launcher/src/services/createSettingsService.ts");

const harness = (saved = {}, overrides = {}) => {
  const data = new Map(Object.entries(saved));
  const reads = [];
  const writes = [];
  const service = createSettingsService({
    storageKey: "aerotizen.settings.v1",
    locale: { timeFormat: () => "24", tempUnit: () => "C" },
    speedRange: { MIN: 0.25, MAX: 3 },
    storage: {
      getItem(key) {
        reads.push(key);
        return data.get(key) ?? null;
      },
      setItem(key, value) {
        writes.push(key);
        data.set(key, value);
      },
    },
    ...overrides,
  });
  return { service, data, reads, writes };
};

test("performance mode stays off for fresh and existing preferences until explicitly enabled", () => {
  for (const saved of [
    {},
    { "aerotizen.settings.v1": JSON.stringify({ background: "snow" }) },
    { "aerotizen.settings.v1": JSON.stringify({ performanceMode: "true" }) },
  ]) {
    const h = harness(saved);
    h.service.load();
    assert.equal(h.service.getSnapshot().performanceMode, false);
    assert.equal(JSON.parse(h.data.get("aerotizen.settings.v1")).performanceMode, false);
    h.service.update({ performanceMode: true });
    h.service.load();
    assert.equal(h.service.getSnapshot().performanceMode, true);
    h.service.update({ performanceMode: false });
    h.service.load();
    assert.equal(h.service.getSnapshot().performanceMode, false);
  }
});

test("the current key wins without reading older storage; derived and unknown fields are never saved", () => {
  const h = harness({
    "aerotizen.settings.v1": JSON.stringify({ background: "snow", home: [], unrelated: true }),
    "hearth.home.v1": JSON.stringify({ background: "lava", home: ["old.app"] }),
  });
  h.service.load();
  assert.deepEqual(h.reads, ["aerotizen.settings.v1"]);
  assert.equal(h.service.getSnapshot().background, "snow");
  assert.equal(h.service.getSnapshot().homeInitialized, true);
  const saved = JSON.parse(h.data.get("aerotizen.settings.v1"));
  assert.deepEqual(saved.home, []);
  assert.equal("homeInitialized" in saved, false);
  assert.equal("unrelated" in saved, false);
});

test("old storage keys are ignored when the current key is missing", () => {
  const h = harness(
    Object.fromEntries(
      ["hearth.home.v1", "declutter.home.v5", "aerotizen.settings.v1.demo"].map((key) => [
        key,
        JSON.stringify({ background: "lava", home: ["old.app"] }),
      ]),
    ),
  );
  h.service.load();
  assert.deepEqual(h.reads, ["aerotizen.settings.v1"]);
  assert.deepEqual(h.writes, ["aerotizen.settings.v1"]);
  assert.equal(h.service.getSnapshot().background, "aurora");
  assert.equal(h.service.getSnapshot().homeInitialized, false);
});

test("old fields use defaults on load and cannot affect runtime updates", () => {
  const oldFields = { favorites: ["video.app"], cardSize: "small", homeCardMode: "rectangle", glassSettings: false };
  const h = harness(
    { "aerotizen.settings.v1": JSON.stringify({ ...oldFields, homeCardColumns: "5", dateFormat: "dmy" }) },
    { defaults: { homeCardColumns: 4, theme: "glass", dateFormat: "iso" } },
  );
  h.service.load();
  assert.equal(h.service.getSnapshot().homeInitialized, false);
  assert.equal(h.service.getSnapshot().homeCardColumns, 4);
  assert.equal(h.service.getSnapshot().theme, "glass");
  assert.equal(h.service.getSnapshot().dateFormat, "iso");
  h.service.update({ homeCardColumns: 5, home: ["current.app"] });
  const current = h.service.getSnapshot();
  h.service.update(oldFields);
  assert.equal(h.service.getSnapshot(), current);
  const saved = JSON.parse(h.data.get("aerotizen.settings.v1"));
  for (const field of Object.keys(oldFields)) {
    assert.equal(field in saved, false);
  }
  h.service.load();
  assert.equal(h.service.getSnapshot(), current, "loading current data is stable");
});

test("custom backgrounds survive reload in the TypeScript service", () => {
  const h = harness({
    "aerotizen.settings.v1": JSON.stringify({
      background: "custom-gradient",
      customColour: "#ABCDEF",
      customGradient: { start: "#AABBCC", end: "#112233", angle: -90 },
    }),
  });
  h.service.load();
  const before = h.service.getSnapshot();
  assert.equal(before.customColour, "#abcdef");
  assert.deepEqual(before.customGradient, { start: "#aabbcc", end: "#112233", angle: 270 });
  h.service.update({ showTime: false });
  assert.equal(h.service.getSnapshot().customGradient, before.customGradient);
  h.service.load();
  assert.equal(h.service.getSnapshot().background, "custom-gradient");
  assert.equal(h.service.getSnapshot().customColour, before.customColour);
  assert.equal(h.service.getSnapshot().customGradient, before.customGradient);
  const stored = JSON.parse(h.data.get("aerotizen.settings.v1"));
  assert.equal(stored.customColour, before.customColour);
  assert.deepEqual(stored.customGradient, before.customGradient);
});

test("custom background updates validate fields before publishing or saving them", () => {
  const h = harness();
  h.service.update({ customColour: "url(example)", customGradient: { start: "red", end: 7, angle: Infinity } });
  const state = h.service.getSnapshot();
  assert.equal(state.customColour, "#7c5cff");
  assert.deepEqual(state.customGradient, { start: "#7c5cff", end: "#00c4d4", angle: 135 });
  assert.equal(Object.isFrozen(state.customGradient), true);
  const stored = JSON.parse(h.data.get("aerotizen.settings.v1"));
  assert.equal(stored.customColour, state.customColour);
  assert.deepEqual(stored.customGradient, state.customGradient);
});

test("malformed JSON shapes and individual values produce usable typed preferences", () => {
  for (const saved of [null, [], true, 5, "text", { home: {}, inputNames: null }]) {
    const h = harness({ "aerotizen.settings.v1": JSON.stringify(saved) });
    assert.doesNotThrow(() => h.service.load());
    assert.equal(h.service.getSnapshot().background, "aurora");
    assert.deepEqual(h.service.getSnapshot().inputNames, {});
  }
  const h = harness({
    "aerotizen.settings.v1": JSON.stringify({
      home: ["one.app", null, "one.app", "bad id"],
      homeCardColumns: { toString: null, valueOf: null },
      showWeather: "false",
      speed: 99,
      inputNames: { "HDMI 1": "Console", "HDMI 2": {} },
      hdmiKeepVisible: { 1: true, 2: "true" },
      weatherLocation: { name: "Invalid", latitude: 200, longitude: 0 },
      timeFormat: "auto",
      tempUnit: "auto",
    }),
  });
  h.service.load();
  const state = h.service.getSnapshot();
  assert.deepEqual(state.home, ["one.app"]);
  assert.equal(state.homeCardColumns, 3);
  assert.equal(state.showWeather, true);
  assert.equal(state.speed, 3);
  assert.deepEqual(state.inputNames, { "HDMI 1": "Console" });
  assert.deepEqual(state.hdmiKeepVisible, { 1: true });
  assert.equal(state.weatherLocation, null);
  assert.equal(state.timeFormat, "24");
  assert.equal(state.tempUnit, "C");
});

test("storage failure retains session changes and immutable snapshots without false notifications", () => {
  const h = harness(
    {},
    {
      storage: {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("full");
        },
      },
    },
  );
  h.service.load();
  const location = { name: "London", latitude: 51.5, longitude: -0.1 };
  const home = ["one.app"];
  let updates = 0;
  h.service.subscribe(() => updates++);
  h.service.update({ home, weatherLocation: location });
  const before = h.service.getSnapshot();
  home.push("two.app");
  location.name = "Changed";
  h.service.update({ background: "snow" });
  assert.deepEqual(before.home, ["one.app"]);
  assert.equal(before.weatherLocation.name, "London");
  assert.equal(h.service.getSnapshot().home, before.home);
  assert.equal(h.service.getSnapshot().weatherLocation, before.weatherLocation);
  assert.throws(() => before.home.push("forbidden"), TypeError);
  const latest = h.service.getSnapshot();
  h.service.update({ background: "snow" });
  assert.equal(h.service.getSnapshot(), latest);
  assert.equal(updates, 2);
});

test("first-launch null and an empty Home survive reload; large Home lists are retained", () => {
  const h = harness();
  h.service.load();
  assert.equal(h.service.getSnapshot().homeInitialized, false);
  assert.equal(JSON.parse(h.data.get("aerotizen.settings.v1")).home, null);
  h.service.update({ home: [] });
  h.service.load();
  assert.equal(h.service.getSnapshot().homeInitialized, true);
  assert.deepEqual(h.service.getSnapshot().home, []);
  const home = Array.from({ length: 120 }, (_, index) => `app.${index}`);
  h.service.update({ home });
  h.service.load();
  assert.deepEqual(h.service.getSnapshot().home, home);
});

test("disposal stops subscriptions and storage access", () => {
  const h = harness();
  let updates = 0;
  h.service.subscribe(() => updates++);
  const unsubscribe = h.service.subscribe(() => updates++);
  unsubscribe();
  unsubscribe();
  h.service.update({ background: "snow" });
  assert.equal(updates, 1);
  h.service.dispose();
  h.service.dispose();
  const writes = h.writes.length;
  h.service.update({ background: "lava" });
  h.service.load();
  assert.equal(updates, 1);
  assert.equal(h.writes.length, writes);
  assert.deepEqual(h.reads, []);
  assert.equal(h.service.getSnapshot().background, "snow");
});

test("saved locale choices avoid further platform detection on updates and reload", () => {
  let detections = 0;
  const h = harness(
    {},
    {
      locale: {
        timeFormat() {
          detections++;
          return "24";
        },
        tempUnit() {
          detections++;
          return "C";
        },
      },
    },
  );
  h.service.load();
  const initial = detections;
  h.service.update({ background: "snow" });
  h.service.update({ speed: 2 });
  h.service.load();
  assert.equal(detections, initial);
});
