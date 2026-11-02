const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createLauncherApp } = loadTypeScript("launcher/src/app/createLauncherApp.ts");

const harness = () => {
  const listeners = new Set();
  const events = new Map();
  const calls = [];
  const document = {
    hidden: false,
    addEventListener(name, listener) {
      events.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (events.get(name) === listener) events.delete(name);
    },
  };
  const source = {
    home: ["one"],
    save() {
      [...listeners].forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const homeBridge = { focus: () => calls.push("focus"), blur: () => calls.push("blur") };
  const settingsBridge = {};
  const previousHome = {};
  const previousSettings = {};
  const statusListeners = [new Set(), new Set(), new Set()];
  const statusSource = (snapshot, listeners) => ({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const platform = { weather: statusSource({}, statusListeners[2]) };
  const runtime = {
    clock: statusSource(0, statusListeners[0]),
    network: statusSource({}, statusListeners[1]),
    settings: source,
    config: { DEFAULTS: {} },
    homeScreen: previousHome,
    settingsUi: previousSettings,
  };
  const hosts = { home: { ownerDocument: document, querySelector: () => null }, settings: {} };
  let homeSettings, editorSettings;
  const views = {
    home(runtime, settings) {
      homeSettings = settings;
      return { bridge: homeBridge, dispose: () => calls.push("dispose home") };
    },
    settings(runtime, platform, settings) {
      assert.equal(runtime.homeScreen, homeBridge, "Home is mounted before Settings");
      editorSettings = settings;
      return { bridge: settingsBridge, dispose: () => calls.push("dispose settings") };
    },
  };
  return {
    runtime,
    platform,
    statusListeners,
    source,
    hosts,
    views,
    calls,
    listeners,
    events,
    document,
    previousHome,
    previousSettings,
    get homeSettings() {
      return homeSettings;
    },
    get editorSettings() {
      return editorSettings;
    },
  };
};

test("Home and Settings share one preference source and release it once", () => {
  const h = harness();
  const app = createLauncherApp(h.runtime, h.platform, h.hosts, h.views);
  assert.equal(h.listeners.size, 1, "there is one source subscription for the whole app");
  assert.equal(h.homeSettings, h.editorSettings);
  h.homeSettings.update({ home: ["two"] });
  assert.deepEqual(h.editorSettings.getSnapshot().home, ["two"]);
  h.document.hidden = true;
  h.events.get("visibilitychange")();
  h.document.hidden = false;
  h.events.get("visibilitychange")();
  assert.deepEqual(h.calls, ["blur", "focus"]);
  app.dispose();
  app.dispose();
  assert.equal(h.listeners.size, 0);
  assert.equal(
    h.statusListeners.reduce((size, listeners) => size + listeners.size, 0),
    0,
  );
  assert.equal(h.events.size, 0);
  assert.deepEqual(h.calls.slice(2), ["dispose settings", "dispose home"]);
  assert.equal(h.runtime.homeScreen, h.previousHome);
  assert.equal(h.runtime.settingsUi, h.previousSettings);
});

test("failed view assembly releases the settings source and already mounted Home", () => {
  const h = harness();
  h.views.settings = () => {
    throw new Error("mount failed");
  };
  assert.throws(() => createLauncherApp(h.runtime, h.platform, h.hosts, h.views), /mount failed/);
  assert.equal(h.listeners.size, 0);
  assert.equal(
    h.statusListeners.reduce((size, listeners) => size + listeners.size, 0),
    0,
  );
  assert.equal(h.events.size, 0);
  assert.deepEqual(h.calls, ["dispose home"]);
  assert.equal(h.runtime.homeScreen, h.previousHome);
  assert.equal(h.runtime.settingsUi, h.previousSettings);
});

test("repeated app replacement does not retain source or visibility listeners", () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    const app = createLauncherApp(h.runtime, h.platform, h.hosts, h.views);
    let updates = 0;
    h.editorSettings.subscribe(() => updates++);
    assert.equal(h.listeners.size, 1);
    assert.equal(h.events.size, 1);
    h.source.home.push(String(i));
    h.source.save();
    assert.equal(updates, 1);
    app.dispose();
    h.source.home.push("after disposal");
    h.source.save();
    assert.equal(updates, 1, "disposed views receive no further source changes");
    assert.equal(h.listeners.size, 0);
    assert.equal(
      h.statusListeners.reduce((size, listeners) => size + listeners.size, 0),
      0,
    );
    assert.equal(h.events.size, 0);
  }
});
