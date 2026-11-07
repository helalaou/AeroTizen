const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createNetworkPlatform } = loadTypeScript("launcher/src/platform/tizen/createNetworkPlatform.ts");

test("native watch zero and browser listeners are removed once, and late events are ignored", () => {
  const events = new Map();
  const removed = [];
  let native;
  let calls = 0;
  const systeminfo = {
    addPropertyValueChangeListener(name, listener) {
      assert.equal(this, systeminfo);
      assert.equal(name, "NETWORK");
      native = listener;
      return 0;
    },
    removePropertyValueChangeListener(id) {
      assert.equal(this, systeminfo);
      removed.push(id);
    },
  };
  const platform = createNetworkPlatform({
    tizen: { systeminfo },
    navigator: { onLine: true },
    addEventListener(name, listener) {
      events.set(name, listener);
    },
    removeEventListener(name, listener) {
      assert.equal(events.get(name), listener);
      events.delete(name);
    },
  });
  const unsubscribe = platform.subscribe(() => calls++);
  native();
  events.get("online")();
  const offline = events.get("offline");
  offline();
  assert.equal(calls, 3);
  unsubscribe();
  unsubscribe();
  native();
  offline();
  assert.equal(calls, 3);
  assert.deepEqual(removed, [0]);
  assert.equal(events.size, 0);
});

test("cancelled discovery does not query Wi-Fi strength or publish results", () => {
  const queries = [];
  let readings = 0;
  const platform = createNetworkPlatform({
    tizen: {
      systeminfo: {
        getPropertyValue(name, done) {
          queries.push({ name, done });
        },
      },
    },
    navigator: { onLine: true },
    addEventListener() {},
    removeEventListener() {},
  });
  const cancel = platform.read(() => readings++);
  cancel();
  queries[0].done({ networkType: "WIFI" });
  assert.equal(queries.length, 1);
  assert.equal(readings, 0);
});

test("unavailable native watches retain browser events and permission errors still permit polling", () => {
  const events = new Map();
  const platform = createNetworkPlatform({
    tizen: {
      systeminfo: {
        getPropertyValue() {
          throw new Error("denied");
        },
        addPropertyValueChangeListener() {
          throw new Error("unsupported");
        },
        removePropertyValueChangeListener() {
          throw new Error("already removed");
        },
      },
    },
    navigator: { onLine: false },
    addEventListener(name, listener) {
      events.set(name, listener);
    },
    removeEventListener(name) {
      events.delete(name);
    },
  });
  let changes = 0;
  const unsubscribe = platform.subscribe(() => changes++);
  events.get("online")();
  assert.equal(changes, 1);
  const results = [];
  assert.doesNotThrow(() => platform.read((value) => results.push(value)));
  assert.deepEqual(results, [{ kind: "offline", strength: null }]);
  unsubscribe();
  assert.equal(events.size, 0);
});
