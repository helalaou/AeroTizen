const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createSettingsService } = loadTypeScript("launcher/src/services/createSettingsService.ts");
const { createStore } = loadTypeScript("launcher/src/shared/state/createStore.ts");
const { createSettingsActions } = loadTypeScript("launcher/src/settings/state/createSettingsActions.ts");
const { createSettingsBridge } = loadTypeScript("launcher/src/settings/services/createSettingsBridge.ts");

const harness = () => {
  let saves = 0;
  const defaults = {
    background: "black",
    home: ["one"],
    inputNames: {},
    speed: 1,
    homeCardColumns: 3,
    homeAppLayout: "grid",
    weatherPhoto: false,
    showWeather: true,
    showTime: true,
    showNetwork: true,
    tempUnit: "C",
    weatherLocation: null,
    weatherShowLocation: true,
    dateFormat: "short",
    timeFormat: "24",
    continueWatching: false,
    continueWatchingApps: [],
    showLiveTv: true,
    hideDisconnectedHdmi: false,
  };
  const settings = createSettingsService({
    defaults,
    storage: { getItem: () => null, setItem: () => saves++ },
    storageKey: "settings",
    legacyStorageKeys: [],
    speedRange: { MIN: 0.2, MAX: 2 },
    locale: { timeFormat: () => "24", tempUnit: () => "C" },
  });
  const calls = [];
  const services = { config: { SPEED: { MIN: 0.2, MAX: 2, STEP: 0.1 } } };
  for (const name of [
    "applyBackground",
    "applyWeatherVisibility",
    "applyLocationVisibility",
    "refreshWeather",
    "applyClock",
    "applyNetworkVisibility",
    "applyInputs",
    "applyCardSize",
    "applySpeed",
    "openStore",
    "useSamsungHome",
    "showPreviewMessage",
    "hidePreviewMessage",
    "clearHomeFocus",
    "finishEditing",
  ]) {
    services[name] = (...args) => calls.push([name, ...args]);
  }
  const view = createStore({
    open: false,
    previewing: false,
    mounted: false,
    openedAt: 0,
    adjusting: false,
  });
  const transaction = (action) => action();
  const actions = createSettingsActions(settings, services, view, transaction);
  let now = 1000;
  const bridge = createSettingsBridge(view, services, transaction, () => now++);
  return {
    settings,
    actions,
    view,
    bridge,
    calls,
    get saves() {
      return saves;
    },
  };
};

test("one service publishes stable immutable snapshots for actions and direct updates", () => {
  const h = harness();
  let updates = 0;
  const unsubscribe = h.settings.subscribe(() => updates++);
  const before = h.settings.getSnapshot();
  assert.equal(before, h.settings.getSnapshot(), "reads do not allocate");
  h.settings.update({});
  assert.equal(updates, 0, "unchanged update does not notify the view");
  h.actions.setTimeFormat("12");
  const time = h.settings.getSnapshot();
  assert.equal(time.home, before.home, "unrelated arrays retain identity");
  assert.equal(time.inputNames, before.inputNames);
  h.settings.update({
    home: [...h.settings.getSnapshot().home, "external"],
    inputNames: { ...h.settings.getSnapshot().inputNames, "HDMI 1": "Console" },
    weatherLocation: { name: "Example", latitude: 1, longitude: 2 },
  });
  const external = h.settings.getSnapshot();
  assert.deepEqual(before.home, ["one"]);
  assert.deepEqual(before.inputNames, {});
  assert.deepEqual(external.home, ["one", "external"]);
  assert.equal(external.inputNames["HDMI 1"], "Console");
  h.settings.update({ weatherLocation: { ...h.settings.getSnapshot().weatherLocation, name: "Changed" } });

  assert.equal(external.weatherLocation.name, "Example", "nested source mutations cannot alter old snapshots");
  assert.throws(() => external.home.push("forbidden"), TypeError);
  assert.equal(updates, 3);
  unsubscribe();
  h.actions.setTimeFormat("24");
  assert.equal(updates, 3);
  h.settings.dispose();
  h.settings.update({ background: "snow" });
  assert.equal(updates, 3, "disposed settings do not publish changes");
});

test("unset Home preferences and a saved empty list have distinct snapshots", () => {
  const h = harness();
  h.settings.update({ home: null });

  const unset = h.settings.getSnapshot();
  assert.equal(unset.homeInitialized, false);
  assert.deepEqual(unset.home, []);
  let updates = 0;
  h.settings.subscribe(() => updates++);
  h.settings.update({ home: [] });
  assert.equal(h.settings.getSnapshot().homeInitialized, true);
  assert.equal(h.settings.getSnapshot().home, unset.home, "unchanged list contents retain identity");
  assert.equal(updates, 1, "initialization changes notify both views even if the list stays empty");
  h.settings.dispose();
});

test("actions persist preferences and invoke only the relevant service", () => {
  const h = harness();
  const cases = [
    ["setBackground", "aurora", "background", "applyBackground"],
    ["setWeatherVisible", false, "showWeather", "applyWeatherVisibility"],
    ["setLocationVisible", false, "weatherShowLocation", "applyLocationVisibility"],
    ["setTempUnit", "F", "tempUnit", "refreshWeather"],
    ["setDateFormat", "iso", "dateFormat", "applyClock"],
    ["setNetworkVisible", false, "showNetwork", "applyNetworkVisibility"],
    ["setLiveTvVisible", false, "showLiveTv", "applyInputs"],
    ["setHomeCardColumns", 5, "homeCardColumns", "applyCardSize"],
    ["setHomeAppLayout", "scroll", "homeAppLayout", "applyCardSize"],
    ["setHdmiVisibility", true, "hideDisconnectedHdmi", "applyInputs"],
    ["setLocation", { name: "Example", latitude: 1, longitude: 2 }, "weatherLocation", "refreshWeather"],
  ];
  for (const [action, value, key, service] of cases) {
    h.calls.length = 0;
    h.actions[action](value);
    assert.deepEqual(h.settings.getSnapshot()[key], value);
    assert.deepEqual(h.calls, [[service]]);
  }
  assert.equal(h.saves, cases.length);
  h.actions.setTimeFormat("none");
  assert.equal(h.settings.getSnapshot().showTime, false);
  h.actions.setTimeFormat("24");
  assert.equal(h.settings.getSnapshot().showTime, true);
  h.actions.saveInputName("HDMI 1", "Console");
  const saves = h.saves;
  h.actions.saveInputName("HDMI 1", "Console");
  assert.equal(h.saves, saves, "unchanged blur does not save twice");
  h.actions.saveInputName("HDMI 1", "");
  assert.deepEqual(h.settings.getSnapshot().inputNames, {});
  h.actions.toggleApp("two");
  assert.deepEqual(h.settings.getSnapshot().home, ["one", "two"]);
  h.actions.toggleApp("one");
  h.actions.toggleApp("two");
  assert.deepEqual(h.settings.getSnapshot().home, []);
  for (let i = 0; i < 30; i++) h.actions.setSpeed(-1);
  assert.equal(h.settings.getSnapshot().speed, 0.2);
  for (let i = 0; i < 30; i++) h.actions.setSpeed(1);
  assert.equal(h.settings.getSnapshot().speed, 2);
});

test("key-router bridge delegates to current handlers and releases them on cleanup", () => {
  const h = harness();
  h.settings.update({ background: "aurora" });
  h.bridge.open();
  assert.equal(h.settings.getSnapshot().background, "aurora");
  assert.equal(h.bridge.isOpen(), true);
  assert.deepEqual(h.view.getSnapshot(), {
    open: true,
    previewing: false,
    mounted: true,
    adjusting: false,
    openedAt: 1000,
  });
  h.bridge.open();
  assert.equal(h.view.getSnapshot().openedAt, 1000, "repeated open preserves the preview timestamp");
  const events = [];
  const old = h.bridge.register({
    focus() {
      events.push("old");
    },
    blur() {},
    keydown() {},
  });
  const current = h.bridge.register({
    focus() {
      events.push("focus");
    },
    blur() {
      events.push("blur");
    },
    keydown(code) {
      events.push(code);
    },
  });
  old();
  h.bridge.focus();
  h.bridge.keydown(40, { preventDefault() {} });
  h.actions.preview();
  assert.equal(h.view.getSnapshot().previewing, true);
  h.bridge.close();
  assert.deepEqual(events, ["focus", 40, "blur"]);
  assert.deepEqual(h.view.getSnapshot(), {
    open: false,
    previewing: false,
    mounted: true,
    adjusting: false,
    openedAt: 1000,
  });
  current();
  h.bridge.focus();
  h.bridge.keydown(13, { preventDefault() {} });
  assert.equal(events.length, 3);
  assert.equal(h.calls.filter(([name]) => name === "finishEditing").length, 1);
  h.bridge.open();
  assert.equal(h.view.getSnapshot().openedAt, 1001, "a new opening captures a fresh preview timestamp");
});

test("weather wallpaper action preserves background and speed and refreshes the shared consumers", () => {
  const h = harness();
  h.actions.setWeatherPhoto(true);
  assert.equal(h.settings.getSnapshot().weatherPhoto, true);
  assert.equal(h.settings.getSnapshot().background, "black");
  assert.equal(h.settings.getSnapshot().speed, 1);
  assert.deepEqual(h.calls, [["applyWeatherVisibility"], ["applyBackground"]]);
  h.actions.setWeatherPhoto(false);
  assert.equal(h.settings.getSnapshot().weatherPhoto, false);
  assert.equal(h.saves, 2);
});

test("Continue Watching selection is persisted with immutable snapshots", () => {
  const h = harness();
  const before = h.settings.getSnapshot();
  h.actions.setContinueWatching(true);
  h.actions.toggleContinueApp("video.app");
  const selected = h.settings.getSnapshot();
  assert.deepEqual(selected.continueWatchingApps, ["video.app"]);
  assert.deepEqual(before.continueWatchingApps, []);
  assert.equal(Object.isFrozen(selected.continueWatchingApps), true);
  h.actions.setContinueWatching(false);
  assert.deepEqual(h.settings.getSnapshot().continueWatchingApps, ["video.app"], "off retains the chosen apps");
  h.actions.toggleContinueApp("video.app");
  assert.deepEqual(h.settings.getSnapshot().continueWatchingApps, []);
});
