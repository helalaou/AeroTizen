const { createTestSettings } = require("./helpers/settings.cjs");
const assert = require("node:assert/strict");
const test = require("node:test");
function setup({ level, standard, online = true, settings = {}, tizen = true } = {}) {
  const requests = [],
    timers = [],
    listeners = [];
  const A = {
    settings: createTestSettings(settings),
    tizen: tizen && {
      systeminfo: {
        getPropertyValue(key, yes, no) {
          requests.push({ key, yes, no });
        },
        addPropertyValueChangeListener(key, listener) {
          listeners.push({ key, listener });
        },
        removePropertyValueChangeListener() {},
      },
    },
  };
  const context = {
    window: {
      AeroTizen: A,
      webapis: {
        network: {
          getWiFiSignalStrengthLevel() {
            if (level instanceof Error) throw level;
            return level;
          },
        },
      },
    },
    navigator: { onLine: online },
    setInterval: (fn) => timers.push(fn),
  };
  require("./helpers/network.cjs").installNetwork(context);
  A.network.start();
  return {
    A,
    listeners,
    requests,
    timers,
    wifi() {
      requests[0].yes({ networkType: "WIFI" });
      if (requests[1]) requests[1].yes({ signalStrength: standard });
    },
  };
}
test("Samsung levels 1..5 use discrete bars; unsupported levels keep standard Tizen fallback", () => {
  for (const [level, expected] of [
    [1, 0.2],
    [2, 0.5],
    [3, 0.5],
    [4, 1],
    [5, 1],
  ]) {
    const h = setup({ level });
    h.wifi();
    assert.equal(h.A.network.getSnapshot().strength, expected);
    assert.equal(h.requests.length, 1);
  }
  for (const level of [undefined, null, 0, 6, 1.5, "5", new Error("denied")]) {
    const h = setup({ level, standard: 0.4 });
    h.wifi();
    assert.equal(h.A.network.getSnapshot().strength, 0.4);
  }
});
test("invalid strength is unavailable, never represented as measured weak Wi-Fi", () => {
  for (const signal of [undefined, null, -1, 2, NaN, "0.2"]) {
    const h = setup({ standard: signal });
    h.wifi();
    assert.equal(h.A.network.getSnapshot().strength, null);
    assert.equal(h.A.network.getSnapshot().kind, "wifi");
  }
  const zero = setup({ standard: 0 });
  zero.wifi();
  assert.equal(zero.A.network.getSnapshot().strength, 0, "zero remains a measured signal level");
});
test("unknown and failed network reports never invent Wi-Fi or offline", () => {
  const h = setup();
  h.requests[0].no();
  assert.equal(h.A.network.getSnapshot().kind, "unknown");
  const off = setup({ online: false });
  off.requests[0].no();
  assert.equal(off.A.network.getSnapshot().kind, "offline");
});
test("late Wi-Fi callbacks cannot overwrite a newer Ethernet report; start is idempotent", () => {
  const h = setup();
  h.requests[0].yes({ networkType: "WIFI" });
  h.A.network.refresh();
  h.requests[2].yes({ networkType: "ETHERNET" });
  h.requests[1].yes({ signalStrength: 0.1 });
  assert.equal(h.A.network.getSnapshot().kind, "ethernet");
  h.A.network.start();
  assert.equal(h.timers.length, 1);
});

test("network snapshots publish without DOM access and retain identity for unchanged data", () => {
  const h = setup({ level: 3 });
  h.A.$ = () => {
    throw new Error("Network detection must not query DOM hosts");
  };
  const initial = h.A.network.getSnapshot();
  assert.equal(h.A.network.getSnapshot(), initial);
  let updates = 0;
  const unsubscribe = h.A.network.subscribe(() => updates++);
  h.wifi();
  const wifi = h.A.network.getSnapshot();
  assert.equal(wifi.kind, "wifi");
  assert.equal(wifi.strength, 0.5);
  assert.equal(Object.isFrozen(wifi), true);
  assert.equal(initial.kind, "unknown");
  h.A.settings.update({ showNetwork: false });
  assert.equal(h.A.network.getSnapshot().visible, false);
  assert.equal(updates, 2);
  unsubscribe();
  assert.equal(updates, 2);
});

test("offline browser snapshots respect network visibility before and after a poll", () => {
  const { A, timers } = setup({ online: false, tizen: false, settings: { showNetwork: false } });
  assert.deepEqual(A.network.getSnapshot(), { kind: "offline", strength: null, visible: false });
  timers[0]();
  assert.equal(A.network.getSnapshot().visible, false);
  A.settings.update({ showNetwork: true });
  assert.deepEqual(A.network.getSnapshot(), { kind: "offline", strength: null, visible: true });
});

test("delayed Tizen replies and network change notifications preserve hidden visibility", () => {
  const { A, requests, listeners, timers } = setup();
  assert.equal(A.network.getSnapshot().visible, true);
  A.settings.update({ showNetwork: false });
  assert.equal(requests[0].key, "NETWORK");
  requests[0].yes({ networkType: "WIFI" });
  assert.equal(requests[1].key, "WIFI_NETWORK");
  requests[1].yes({ signalStrength: 0.8 });
  assert.deepEqual(A.network.getSnapshot(), { kind: "wifi", strength: 0.8, visible: false });

  assert.equal(listeners[0].key, "NETWORK");
  listeners[0].listener();
  requests[2].yes({ networkType: "ETHERNET" });
  assert.deepEqual(A.network.getSnapshot(), { kind: "ethernet", strength: null, visible: false });

  timers[0]();
  requests[3].no();
  assert.equal(A.network.getSnapshot().visible, false);
  A.settings.update({ showNetwork: true });
  assert.deepEqual(A.network.getSnapshot(), { kind: "unknown", strength: null, visible: true });
});
