const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createHomeInventory } = loadTypeScript("launcher/src/home/state/createHomeInventory.ts");
const { createSettingsStore } = loadTypeScript("launcher/src/services/createSettingsStore.ts");

test("Home inventories publish stable immutable data and respond to preference changes", () => {
  const appListeners = new Set(),
    inputListeners = new Set(),
    feedListeners = new Set(),
    preferenceListeners = new Set();
  const subscribe = (listeners) => (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const source = {
    home: [],
    showLiveTv: true,
    save() {
      [...preferenceListeners].forEach((fn) => fn());
    },
    subscribe: subscribe(preferenceListeners),
  };
  const settings = createSettingsStore(source, { home: [], showLiveTv: true });
  const runtime = {
    apps: { all: [{ id: "one", name: "One" }], ready: false, subscribe: subscribe(appListeners) },
    inputs: {
      sources: [
        { type: "TV", number: 1 },
        { type: "HDMI", number: 2, connected: true },
      ],
      isVisible(input) {
        assert.equal(this, runtime.inputs);
        return input.type !== "TV" || source.showLiveTv;
      },
      subscribe: subscribe(inputListeners),
    },
    continueWatching: { items: [], subscribe: subscribe(feedListeners) },
  };
  const inventory = createHomeInventory(runtime, settings, (fn) => fn());
  const first = inventory.getSnapshot();
  let updates = 0;
  inventory.subscribe(() => updates++);
  [...appListeners, ...inputListeners, ...feedListeners].forEach((fn) => fn());
  assert.equal(inventory.getSnapshot(), first);
  assert.equal(updates, 0);
  runtime.apps.all[0].name = "Renamed";
  [...appListeners].forEach((fn) => fn());
  assert.equal(first.apps[0].name, "One");
  assert.equal(inventory.getSnapshot().apps[0].name, "Renamed");
  assert.equal(inventory.getSnapshot().inputs, first.inputs);
  assert.equal(Object.isFrozen(inventory.getSnapshot().apps[0]), true);
  settings.update({ showLiveTv: false });
  assert.deepEqual(
    inventory.getSnapshot().inputs.map((input) => input.type),
    ["HDMI"],
  );
  runtime.apps.ready = true;
  [...appListeners].forEach((fn) => fn());
  assert.equal(inventory.getSnapshot().ready, true);
  runtime.continueWatching.items.push({ key: "one", title: "Episode" });
  [...feedListeners].forEach((fn) => fn());
  assert.equal(inventory.getSnapshot().items[0].title, "Episode");
  assert.equal(first.items.length, 0);
  const latest = inventory.getSnapshot();
  inventory.dispose();
  assert.equal(appListeners.size + inputListeners.size + feedListeners.size, 0);
  settings.update({ showLiveTv: true });
  assert.equal(inventory.getSnapshot(), latest);
  settings.dispose();
  assert.equal(preferenceListeners.size, 0);
});
