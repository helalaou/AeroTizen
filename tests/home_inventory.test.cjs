const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createHomeInventory } = loadTypeScript("launcher/src/home/state/createHomeInventory.ts");
const { createSettingsService } = loadTypeScript("launcher/src/services/createSettingsService.ts");

test("Home inventories publish stable immutable data and respond to preference changes", () => {
  const appListeners = new Set(),
    inputListeners = new Set(),
    feedListeners = new Set();
  const subscribe = (listeners) => (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const settings = createSettingsService({
    defaults: { home: [], showLiveTv: true },
    storage: { getItem: () => null, setItem() {} },
    storageKey: "settings",
    legacyStorageKeys: [],
    speedRange: { MIN: 0.25, MAX: 3 },
    locale: { timeFormat: () => "24", tempUnit: () => "C" },
  });
  let feed = Object.freeze({ items: Object.freeze([]) });
  let appSnapshot = Object.freeze({ all: Object.freeze([Object.freeze({ id: "one", name: "One" })]), ready: false });
  let inputSnapshot = Object.freeze({
    visibleSources: Object.freeze([
      Object.freeze({ type: "TV", number: 1 }),
      Object.freeze({ type: "HDMI", number: 2, connected: true }),
    ]),
  });
  const runtime = {
    apps: { getSnapshot: () => appSnapshot, subscribe: subscribe(appListeners) },
    inputs: {
      getSnapshot: () => inputSnapshot,
      subscribe: subscribe(inputListeners),
    },
    continueWatching: { getSnapshot: () => feed, subscribe: subscribe(feedListeners) },
  };
  const inventory = createHomeInventory(runtime, settings, (fn) => fn());
  const first = inventory.getSnapshot();
  let updates = 0;
  inventory.subscribe(() => updates++);
  [...appListeners, ...inputListeners, ...feedListeners].forEach((fn) => fn());
  assert.equal(inventory.getSnapshot(), first);
  assert.equal(updates, 0);
  appSnapshot = Object.freeze({ ...appSnapshot, all: Object.freeze([Object.freeze({ id: "one", name: "Renamed" })]) });
  [...appListeners].forEach((fn) => fn());
  assert.equal(first.apps[0].name, "One");
  assert.equal(inventory.getSnapshot().apps[0].name, "Renamed");
  assert.equal(inventory.getSnapshot().apps, appSnapshot.all, "Home shares the app service array");
  assert.equal(inventory.getSnapshot().inputs, first.inputs);
  assert.equal(inventory.getSnapshot().inputs, inputSnapshot.visibleSources, "Home shares the service input array");
  assert.equal(Object.isFrozen(inventory.getSnapshot().apps[0]), true);
  inputSnapshot = Object.freeze({
    visibleSources: Object.freeze(inputSnapshot.visibleSources.filter((source) => source.type !== "TV")),
  });
  settings.update({ showLiveTv: false });
  assert.deepEqual(
    inventory.getSnapshot().inputs.map((input) => input.type),
    ["HDMI"],
  );
  appSnapshot = Object.freeze({ ...appSnapshot, ready: true });
  [...appListeners].forEach((fn) => fn());
  assert.equal(inventory.getSnapshot().ready, true);
  feed = Object.freeze({ items: Object.freeze([Object.freeze({ key: "one", title: "Episode" })]) });
  [...feedListeners].forEach((fn) => fn());
  assert.equal(inventory.getSnapshot().items[0].title, "Episode");
  assert.equal(inventory.getSnapshot().items, feed.items, "Home reads the shared feed snapshot without copying");
  assert.equal(first.items.length, 0);
  const latest = inventory.getSnapshot();
  inventory.dispose();
  assert.equal(appListeners.size + inputListeners.size + feedListeners.size, 0);
  settings.update({ showLiveTv: true });
  assert.equal(inventory.getSnapshot(), latest);
  settings.dispose();
});
