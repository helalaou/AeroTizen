// Launcher tests run the real browser scripts in a Node sandbox: node --test tests/*.test.cjs
const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { installClock } = require("./helpers/clock.cjs");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { installSettings } = require("./helpers/settings.cjs");
const { launcherConfig } = loadTypeScript("launcher/src/launcherConfig.ts");

function loadSettings(storage, defaults = {}) {
  const store = { ...storage };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
  const A = { config: launcherConfig };
  const context = vm.createContext({
    window: { AeroTizen: A, Intl, navigator: { language: "en-GB", languages: ["en-GB"] } },
    localStorage,
  });
  installClock(context);
  installSettings(context, defaults);
  A.settings.load();
  return { settings: A.settings, store };
}

test("defaults apply when nothing is saved", () => {
  const { settings } = loadSettings({});
  assert.equal(settings.getSnapshot().background, "aurora");
  assert.equal(settings.getSnapshot().tempUnit, "C");
  assert.equal(settings.getSnapshot().timeFormat, "24");
  assert.equal(settings.getSnapshot().homeInitialized, false, "first launch selects default tiles");
  assert.equal(settings.getSnapshot().showWeather, true);
  assert.equal(settings.getSnapshot().showTime, true);
  assert.equal(settings.getSnapshot().showNetwork, true);
  assert.equal(settings.getSnapshot().homeCardColumns, 3);
  assert.equal(settings.getSnapshot().homeAppLayout, "grid");
});

test("Home layout persists independently of app size and rejects unknown layout values", () => {
  const key = "aerotizen.settings.v1";
  const { settings, store } = loadSettings({ [key]: JSON.stringify({ homeCardColumns: 4 }) });
  assert.equal(settings.getSnapshot().homeAppLayout, "grid");
  settings.update({ homeAppLayout: "scroll" });

  const restarted = loadSettings(store).settings;
  assert.equal(restarted.getSnapshot().homeAppLayout, "scroll");
  assert.equal(restarted.getSnapshot().homeCardColumns, 4);
  for (const value of [null, true, "carousel", "rectangle"]) {
    assert.equal(
      loadSettings({ [key]: JSON.stringify({ homeAppLayout: value }) }).settings.getSnapshot().homeAppLayout,
      "grid",
    );
  }
});

test("card columns validate the current values and preserve other preferences", () => {
  const key = "aerotizen.settings.v1";
  for (const homeCardColumns of [undefined, null, 3, 4, 5, "4", 0, 6, "invalid"]) {
    const values = {
      homeCardColumns,
      home: ["video.app", "__fire"],
      background: "lava",
      showWeather: false,
      tempUnit: "F",
      timeFormat: "12",
    };
    const { settings, store } = loadSettings({ [key]: JSON.stringify(values) });
    const expected = [3, 4, 5].includes(homeCardColumns) ? homeCardColumns : 3;
    assert.equal(settings.getSnapshot().homeCardColumns, expected);
    const saved = JSON.parse(store[key]);
    assert.equal(saved.homeCardColumns, expected);
    assert.deepEqual(saved.home, values.home);
    assert.equal(saved.background, values.background);
    assert.equal(saved.showWeather, false);
    assert.equal(saved.tempUnit, "F");
    assert.equal(saved.timeFormat, "12");
    assert.equal(loadSettings(store).settings.getSnapshot().homeCardColumns, expected);
  }
});

test("browser preview defaults do not override a saved card column count", () => {
  const key = "aerotizen.settings.v1";
  const { settings } = loadSettings({ [key]: JSON.stringify({ homeCardColumns: 3 }) }, { homeCardColumns: 5 });
  assert.equal(settings.getSnapshot().homeCardColumns, 3);
  assert.equal(loadSettings({}, { homeCardColumns: 5 }).settings.getSnapshot().homeCardColumns, 5);
});

test("missing visibility preferences keep all header items visible", () => {
  const { settings } = loadSettings({
    "aerotizen.settings.v1": JSON.stringify({ tempUnit: "F", dateFormat: "none" }),
  });
  assert.equal(settings.getSnapshot().showWeather, true);
  assert.equal(settings.getSnapshot().showTime, true);
  assert.equal(settings.getSnapshot().showNetwork, true);
  assert.equal(settings.getSnapshot().dateFormat, "none");
  assert.equal(settings.getSnapshot().tempUnit, "F");
});

test("header visibility survives a restart without changing date or weather preferences", () => {
  const location = { name: "London", latitude: 51.5085, longitude: -0.1257, country_code: "GB" };
  const { settings, store } = loadSettings({});
  settings.update({
    showWeather: false,
    showTime: false,
    showNetwork: false,
    dateFormat: "iso",
    timeFormat: "24",
    weatherLocation: location,
    tempUnit: "F",
    weatherShowLocation: false,
  });

  const restarted = loadSettings(store).settings;
  assert.equal(restarted.getSnapshot().showWeather, false);
  assert.equal(restarted.getSnapshot().showTime, false);
  assert.equal(restarted.getSnapshot().showNetwork, false);
  assert.equal(restarted.getSnapshot().dateFormat, "iso");
  assert.equal(restarted.getSnapshot().timeFormat, "24");
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.getSnapshot().weatherLocation)), location);
  assert.equal(restarted.getSnapshot().tempUnit, "F");
  assert.equal(restarted.getSnapshot().weatherShowLocation, false);

  restarted.update({ showWeather: true });
  restarted.update({ showTime: true });
  restarted.update({ showNetwork: true });

  restarted.load();
  assert.equal(restarted.getSnapshot().showWeather, true);
  assert.equal(restarted.getSnapshot().showTime, true);
  assert.equal(restarted.getSnapshot().showNetwork, true);
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.getSnapshot().weatherLocation)), location);
  assert.equal(restarted.getSnapshot().tempUnit, "F");
  assert.equal(restarted.getSnapshot().dateFormat, "iso");
});

test("an empty saved Home stays empty", () => {
  const { settings } = loadSettings({ "aerotizen.settings.v1": JSON.stringify({ home: [] }) });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.getSnapshot().home)), []);
});

test("the theme persists and falls back to the default for unknown values", () => {
  const key = "aerotizen.settings.v1";
  const { settings, store } = loadSettings({});
  assert.equal(settings.getSnapshot().theme, "classic");
  settings.update({ theme: "glass" });
  assert.equal(loadSettings(store).settings.getSnapshot().theme, "glass");
  settings.update({ theme: "gloss" });
  assert.equal(loadSettings(store).settings.getSnapshot().theme, "gloss");
  for (const defaultTheme of ["classic", "glass"]) {
    for (const theme of [null, true, "frosted"]) {
      const saved = { [key]: JSON.stringify({ theme }) };
      assert.equal(loadSettings(saved, { theme: defaultTheme }).settings.getSnapshot().theme, defaultTheme);
    }
  }
});

test("save writes only known settings under the current key", () => {
  const { settings, store } = loadSettings({});
  settings.update({ background: "snow" });
  settings.update({ unrelated: "ignored" });

  const saved = JSON.parse(store["aerotizen.settings.v1"]);
  assert.equal(saved.background, "snow");
  assert.equal("unrelated" in saved, false);
});

test("corrupt storage falls back to defaults", () => {
  const { settings } = loadSettings({ "aerotizen.settings.v1": "{not json" });
  assert.equal(settings.getSnapshot().background, "aurora");
});

test("settings publish updates and reloads, and unsubscribe is safe to repeat", () => {
  const { settings, store } = loadSettings({});
  const values = [];
  const unsubscribe = settings.subscribe(() => values.push(settings.getSnapshot().background));
  settings.update({ background: "snow" });

  store["aerotizen.settings.v1"] = JSON.stringify({ background: "black" });
  settings.load();
  assert.deepEqual(values, ["snow", "black"]);
  unsubscribe();
  unsubscribe();
  settings.update({ background: "lava" });

  assert.deepEqual(values, ["snow", "black"]);
});

test("Continue Watching requires explicit opt-in and validates saved source choices", () => {
  const { settings } = loadSettings({});
  assert.equal(settings.getSnapshot().continueWatching, false);
  assert.deepEqual(Array.from(settings.getSnapshot().continueWatchingApps), []);
  const key = "aerotizen.settings.v1";
  const restored = loadSettings({
    [key]: JSON.stringify({
      continueWatching: "true",
      continueWatchingApps: ["video.app", "video.app", null, {}, "bad id", "other-app"],
    }),
  }).settings;
  assert.equal(restored.getSnapshot().continueWatching, false);
  assert.deepEqual(Array.from(restored.getSnapshot().continueWatchingApps), ["video.app", "other-app"]);
});

test("custom colours persist, normalize case and reject malformed saved values", () => {
  const key = "aerotizen.settings.v1";
  const original = loadSettings({ [key]: JSON.stringify({ background: "custom", customColour: "#A1B2C3" }) });
  assert.equal(original.settings.getSnapshot().customColour, "#a1b2c3");
  original.settings.update({ customColour: "#A1B2C3" });
  assert.equal(loadSettings(original.store).settings.getSnapshot().customColour, "#a1b2c3");
  for (const customColour of [null, 123, "#fff", "red", "url(example)", "#12345678"]) {
    assert.equal(
      loadSettings({ [key]: JSON.stringify({ customColour }) }).settings.getSnapshot().customColour,
      "#7c5cff",
    );
  }
});

test("custom gradients preserve both colours and direction across a restart and validate saved fields", () => {
  const key = "aerotizen.settings.v1";
  const original = loadSettings({
    [key]: JSON.stringify({
      background: "custom-gradient",
      customGradient: { start: "#AABBCC", end: "#001122", angle: -90 },
    }),
  });
  const restarted = loadSettings(original.store).settings.getSnapshot();
  assert.equal(restarted.background, "custom-gradient");
  assert.equal(restarted.customGradient.start, "#aabbcc");
  assert.equal(restarted.customGradient.end, "#001122");
  assert.equal(restarted.customGradient.angle, 270);
  const invalid = loadSettings({
    [key]: JSON.stringify({ customGradient: { start: "url(example)", end: 7, angle: "90" } }),
  }).settings.getSnapshot();
  assert.equal(invalid.customGradient.start, "#7c5cff");
  assert.equal(invalid.customGradient.end, "#00c4d4");
  assert.equal(invalid.customGradient.angle, 135);
});
