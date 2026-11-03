const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createStatusStores } = loadTypeScript("launcher/src/services/createStatusStores.ts");

const source = (initial) => {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      [...listeners].forEach((listener) => listener());
    },
    get count() {
      return listeners.size;
    },
    start() {
      throw new Error("A status view must not start polling");
    },
    refresh() {
      throw new Error("A status view must not request a forecast");
    },
  };
};

test("status consumers share service subscriptions, recheck expiry and release their bindings", () => {
  const clock = source(0),
    network = source({ kind: "unknown", strength: null, visible: true });
  const fresh = { temperature: 12, code: 3, city: "London", visible: true };
  const expired = { temperature: null, code: null, city: "", visible: false };
  const weather = source(fresh),
    preferences = source({});
  weather.getSnapshot = () => (clock.getSnapshot() < 100 ? fresh : expired);
  const stores = createStatusStores({ clock, network }, { weather }, (fn) => fn(), preferences);
  const consumer1 = stores.weather.subscribe(() => {});
  const consumer2 = stores.weather.subscribe(() => {});
  assert.deepEqual([clock.count, network.count, weather.count, preferences.count], [1, 1, 1, 1]);
  clock.set(100);
  assert.equal(stores.time.getSnapshot(), 100);
  assert.equal(
    stores.weather.getSnapshot(),
    expired,
    "clock changes invalidate an expired cached reading without a request",
  );
  const visible = { kind: "wifi", strength: 0.5, visible: true };
  network.set(visible);
  assert.equal(stores.network.getSnapshot(), visible);
  consumer1();
  consumer2();
  stores.dispose();
  assert.deepEqual([clock.count, network.count, weather.count, preferences.count], [0, 0, 0, 0]);
  clock.set(200);
  assert.equal(stores.time.getSnapshot(), 100);
});
