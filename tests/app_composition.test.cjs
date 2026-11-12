const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createSettingsService } = loadTypeScript("launcher/src/services/createSettingsService.ts");
const { createLauncherApp } = loadTypeScript("launcher/src/app/createLauncherApp.ts");

const harness = () => {
  const events = new Map();
  const calls = [];
  const document = {
    hidden: false,
    documentElement: { lang: "en" },
    addEventListener(name, listener) {
      events.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (events.get(name) === listener) events.delete(name);
    },
  };
  const makeSettings = () =>
    createSettingsService({
      defaults: { home: ["one"] },
      storage: { getItem: () => null, setItem() {} },
      storageKey: "settings",
      speedRange: { MIN: 0.25, MAX: 3 },
      locale: { timeFormat: () => "24", tempUnit: () => "C" },
    });
  const settings = makeSettings();
  const homeBridge = { focus: () => calls.push("focus"), blur: () => calls.push("blur") };
  const settingsBridge = {};
  const previousHome = {};
  const previousSettings = {};
  const previousTranslate = () => "previous";
  const statusListeners = [new Set(), new Set(), new Set()];
  const updateCalls = [];
  const updates = {
    check: () => updateCalls.push("check"),
    dispose: () => updateCalls.push("dispose"),
  };
  const statusSource = (snapshot, listeners) => ({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const platform = {};
  const runtime = {
    clock: statusSource(0, statusListeners[0]),
    network: statusSource({}, statusListeners[1]),
    weather: statusSource({}, statusListeners[2]),
    settings,
    config: { DEFAULTS: {} },
    homeScreen: previousHome,
    settingsUi: previousSettings,
    translate: previousTranslate,
  };
  const hosts = { home: { ownerDocument: document, querySelector: () => null }, settings: {} };
  let homeSettings, editorSettings, homeTranslations, editorTranslations;
  const views = {
    home(runtime, settings, mount, status, translations) {
      assert.equal(status.time, runtime.clock);
      assert.equal(status.network, runtime.network);
      assert.equal(status.weather, runtime.weather);
      homeTranslations = translations;
      homeSettings = settings;
      return { bridge: homeBridge, dispose: () => calls.push("dispose home") };
    },
    settings(runtime, platform, settings, mount, translations) {
      editorTranslations = translations;
      assert.equal(runtime.homeScreen, homeBridge, "Home is mounted before Settings");
      editorSettings = settings;
      return { bridge: settingsBridge, dispose: () => calls.push("dispose settings") };
    },
  };
  return {
    runtime,
    platform,
    statusListeners,
    settings,
    makeSettings,
    hosts,
    views,
    updates,
    updateCalls,
    calls,
    events,
    document,
    previousHome,
    previousSettings,
    previousTranslate,
    get homeTranslations() {
      return homeTranslations;
    },
    get editorTranslations() {
      return editorTranslations;
    },
    get homeSettings() {
      return homeSettings;
    },
    get editorSettings() {
      return editorSettings;
    },
  };
};

test("Home and Settings share the injected preference service", () => {
  const h = harness();
  const app = createLauncherApp(h.runtime, h.platform, h.hosts, h.views, h.updates, h.settings);
  assert.equal(h.homeSettings, h.editorSettings);
  assert.equal(h.homeSettings, h.settings, "views use the canonical service without a second snapshot store");
  assert.equal(h.homeTranslations, h.editorTranslations);
  assert.equal(h.homeTranslations.getSnapshot().t("common.settings"), "Settings");
  assert.equal(h.runtime.translate("apps.openFailed", { name: "A & B <HD>" }), "Could not open A & B <HD>");
  h.homeSettings.update({ home: ["two"] });
  assert.deepEqual(h.editorSettings.getSnapshot().home, ["two"]);
  h.document.hidden = true;
  h.events.get("visibilitychange")();
  assert.deepEqual(h.updateCalls, ["check"]);
  h.document.hidden = false;
  h.events.get("visibilitychange")();
  assert.deepEqual(h.calls, ["blur", "focus"]);
  assert.deepEqual(h.updateCalls, ["check", "check"]);
  app.dispose();
  app.dispose();
  assert.equal(
    h.statusListeners.reduce((size, listeners) => size + listeners.size, 0),
    0,
  );
  assert.equal(h.events.size, 0);
  assert.deepEqual(h.updateCalls, ["check", "check", "dispose"]);
  assert.deepEqual(h.calls.slice(2), ["dispose settings", "dispose home"]);
  assert.equal(h.runtime.homeScreen, h.previousHome);
  assert.equal(h.runtime.settingsUi, h.previousSettings);
  assert.equal(h.runtime.translate, h.previousTranslate);
});

test("failed view assembly releases subscriptions and already mounted Home", () => {
  const h = harness();
  h.views.settings = () => {
    throw new Error("mount failed");
  };
  assert.throws(
    () => createLauncherApp(h.runtime, h.platform, h.hosts, h.views, h.updates, h.settings),
    /mount failed/,
  );
  assert.equal(
    h.statusListeners.reduce((size, listeners) => size + listeners.size, 0),
    0,
  );
  assert.equal(h.events.size, 0);
  assert.deepEqual(h.calls, ["dispose home"]);
  assert.equal(h.runtime.homeScreen, h.previousHome);
  assert.equal(h.runtime.settingsUi, h.previousSettings);
  assert.equal(h.runtime.translate, h.previousTranslate);
});

test("repeated app replacement does not retain source or visibility listeners", () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    const app = createLauncherApp(h.runtime, h.platform, h.hosts, h.views, h.updates, h.settings);
    let updates = 0;
    const unsubscribe = h.editorSettings.subscribe(() => updates++);
    assert.equal(h.events.size, 1);
    h.settings.update({ home: [String(i)] });
    assert.equal(updates, 1);
    app.dispose();
    unsubscribe();
    h.settings.update({ home: ["after disposal"] });
    assert.equal(updates, 1, "disposed views receive no further source changes");
    assert.equal(
      h.statusListeners.reduce((size, listeners) => size + listeners.size, 0),
      0,
    );
    assert.equal(h.events.size, 0);
  }
});

test("replacing views preserves the runtime preference service and TV-service subscriptions", () => {
  const h = harness();
  let updates = 0;
  const unsubscribe = h.settings.subscribe(() => updates++);
  for (const background of ["snow", "lava", "black"]) {
    const app = createLauncherApp(h.runtime, h.platform, h.hosts, h.views, h.updates, h.settings);
    app.dispose();
    h.settings.update({ background });
    assert.equal(h.settings.getSnapshot().background, background);
  }
  assert.equal(updates, 3);
  unsubscribe();
  h.settings.dispose();
});
