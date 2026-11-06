// Launcher tests run the real browser scripts in a Node sandbox: node --test tests/*.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSettings(storage, defaults = {}) {
  const store = { ...storage };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
  const A = {};
  const context = vm.createContext({
    window: { AeroTizen: A, Intl, navigator: { language: "en-GB", languages: ["en-GB"] } },
    AeroTizen: A,
    localStorage,
  });
  for (const file of ["config.js", "settings.js", "clock.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "launcher", "js", file), "utf8"), context);
  }
  Object.assign(A.config.DEFAULTS, defaults);
  A.settings.load();
  return { settings: A.settings, store };
}

test("defaults apply when nothing is saved", () => {
  const { settings } = loadSettings({});
  assert.equal(settings.background, "aurora");
  assert.equal(settings.tempUnit, "C");
  assert.equal(settings.timeFormat, "24");
  assert.equal(settings.home, null, "null picks the default tiles on first launch");
  assert.equal(settings.showWeather, true);
  assert.equal(settings.showTime, true);
  assert.equal(settings.showNetwork, true);
  assert.equal(settings.homeCardColumns, 3);
  assert.equal(settings.homeAppLayout, "grid");
  assert.equal("cardSize" in settings, false);
  assert.equal("homeCardMode" in settings, false);
});

test("Home layout persists independently of app size and rejects unknown layout values", () => {
  const key = "aerotizen.settings.v1";
  const { settings, store } = loadSettings({ [key]: JSON.stringify({ homeCardColumns: 4 }) });
  assert.equal(settings.homeAppLayout, "grid");
  settings.homeAppLayout = "scroll";
  settings.save();
  const restarted = loadSettings(store).settings;
  assert.equal(restarted.homeAppLayout, "scroll");
  assert.equal(restarted.homeCardColumns, 4);
  for (const value of [null, true, "carousel", "rectangle"]) {
    assert.equal(loadSettings({ [key]: JSON.stringify({ homeAppLayout: value }) }).settings.homeAppLayout, "grid");
  }
});

test("square cards migrate legacy sizes and keep explicit row counts and other preferences", () => {
  for (const key of ["aerotizen.settings.v1", "hearth.home.v1", "declutter.home.v5"]) {
    for (const cardSize of ["big", "small"]) {
      for (const homeCardColumns of [undefined, null, 3, 4, 5, "4", 0, 6, "invalid"]) {
        const legacy = {
          cardSize,
          homeCardMode: "rectangle",
          homeCardColumns,
          home: ["video.app", "__fire"],
          background: "lava",
          showWeather: false,
          tempUnit: "F",
          timeFormat: "12",
        };
        const { settings, store } = loadSettings({ [key]: JSON.stringify(legacy) });
        const columns = Number(homeCardColumns);
        const expected = [3, 4, 5].includes(columns) ? columns : cardSize === "small" ? 5 : 3;
        assert.equal(settings.homeCardColumns, expected);
        const saved = JSON.parse(store["aerotizen.settings.v1"]);
        assert.equal(saved.homeCardColumns, expected, "migration is saved even with explicit locale settings");
        assert.equal("cardSize" in saved, false);
        assert.equal("homeCardMode" in saved, false);
        assert.deepEqual(saved.home, legacy.home);
        assert.equal(saved.background, legacy.background);
        assert.equal(saved.showWeather, false);
        assert.equal(saved.tempUnit, "F");
        assert.equal(saved.timeFormat, "12");
        assert.equal(loadSettings(store).settings.homeCardColumns, expected, "migration survives restart");
      }
    }
  }
});

test("browser demo defaults do not override a saved Big card choice", () => {
  const key = "aerotizen.settings.v1";
  const { settings } = loadSettings({ [key]: JSON.stringify({ cardSize: "big" }) }, { homeCardColumns: 5 });
  assert.equal(settings.homeCardColumns, 3);
  assert.equal(loadSettings({}, { homeCardColumns: 5 }).settings.homeCardColumns, 5);
});

test("older current and legacy saves keep all header items visible", () => {
  for (const key of ["aerotizen.settings.v1", "hearth.home.v1", "declutter.home.v5"]) {
    const { settings } = loadSettings({
      [key]: JSON.stringify({ tempUnit: "F", dateFormat: "none" }),
    });
    assert.equal(settings.showWeather, true, key);
    assert.equal(settings.showTime, true, key);
    assert.equal(settings.showNetwork, true, key);
    assert.equal(settings.dateFormat, "none", "date remains under its existing setting");
    assert.equal(settings.tempUnit, "F");
  }
});

test("header visibility survives a restart without changing date or weather preferences", () => {
  const location = { name: "London", latitude: 51.5085, longitude: -0.1257, country_code: "GB" };
  const { settings, store } = loadSettings({});
  Object.assign(settings, {
    showWeather: false,
    showTime: false,
    showNetwork: false,
    dateFormat: "iso",
    timeFormat: "24",
    weatherLocation: location,
    tempUnit: "F",
    weatherShowLocation: false,
  });
  settings.save();
  const restarted = loadSettings(store).settings;
  assert.equal(restarted.showWeather, false);
  assert.equal(restarted.showTime, false);
  assert.equal(restarted.showNetwork, false);
  assert.equal(restarted.dateFormat, "iso");
  assert.equal(restarted.timeFormat, "24");
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.weatherLocation)), location);
  assert.equal(restarted.tempUnit, "F");
  assert.equal(restarted.weatherShowLocation, false);

  restarted.showWeather = true;
  restarted.showTime = true;
  restarted.showNetwork = true;
  restarted.save();
  restarted.load();
  assert.equal(restarted.showWeather, true);
  assert.equal(restarted.showTime, true);
  assert.equal(restarted.showNetwork, true);
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.weatherLocation)), location);
  assert.equal(restarted.tempUnit, "F");
  assert.equal(restarted.dateFormat, "iso");
});

test("an empty saved Home stays empty", () => {
  const { settings } = loadSettings({ "aerotizen.settings.v1": JSON.stringify({ home: [] }) });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home)), []);
});

test("settings migrate from an earlier storage key and field name", () => {
  const legacy = { favorites: ["a.app", "__fire"], background: "lava", speed: 2 };
  const { settings } = loadSettings({ "hearth.home.v1": JSON.stringify(legacy) });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home)), ["a.app", "__fire"]);
  assert.equal(settings.background, "lava");
  assert.equal(settings.speed, 2);
});

test("save writes only known settings under the current key", () => {
  const { settings, store } = loadSettings({});
  settings.background = "snow";
  settings.unrelated = "ignored";
  settings.save();
  const saved = JSON.parse(store["aerotizen.settings.v1"]);
  assert.equal(saved.background, "snow");
  assert.equal("unrelated" in saved, false);
});

test("corrupt storage falls back to defaults", () => {
  const { settings } = loadSettings({ "aerotizen.settings.v1": "{not json" });
  assert.equal(settings.background, "aurora");
});

test("settings publish saves and reloads, and unsubscribe is safe to repeat", () => {
  const { settings } = loadSettings({});
  const values = [];
  const unsubscribe = settings.subscribe(() => values.push(settings.background));
  settings.background = "snow";
  settings.save();
  settings.background = "black";
  settings.load();
  assert.deepEqual(values, ["snow", "snow"]);
  unsubscribe();
  unsubscribe();
  settings.background = "lava";
  settings.save();
  assert.deepEqual(values, ["snow", "snow"]);
});

test("Continue Watching requires explicit opt-in and validates saved source choices", () => {
  const { settings } = loadSettings({});
  assert.equal(settings.continueWatching, false);
  assert.deepEqual(Array.from(settings.continueWatchingApps), []);
  const key = "aerotizen.settings.v1";
  const restored = loadSettings({
    [key]: JSON.stringify({
      continueWatching: "true",
      continueWatchingApps: ["video.app", "video.app", null, {}, "bad id", "other-app"],
    }),
  }).settings;
  assert.equal(restored.continueWatching, false);
  assert.deepEqual(Array.from(restored.continueWatchingApps), ["video.app", "other-app"]);
});
