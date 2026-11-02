const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../launcher/js/network.js"), "utf8");
function setup(level, standard, online = true, view = true) {
  const attrs = {},
    requests = [],
    timers = [];
  const el = {
    setAttribute(k, v) {
      attrs[k] = v;
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    classList: { toggle() {} },
  };
  const A = {
    settings: {},
    $: () => el,
    tizen: {
      systeminfo: {
        getPropertyValue(key, yes, no) {
          requests.push({ key, yes, no });
        },
        addPropertyValueChangeListener() {},
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
  vm.runInNewContext(source, context);
  if (view)
    vm.runInNewContext(
      fs.readFileSync(require("node:path").join(__dirname, "fixtures/legacy-launcher/js/status-view.js"), "utf8"),
      context,
    );
  A.network.start();
  return {
    A,
    attrs,
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
    const h = setup(level);
    h.wifi();
    assert.equal(h.attrs["data-net-level"], String(expected));
    assert.equal(h.requests.length, 1);
  }
  for (const level of [undefined, null, 0, 6, 1.5, "5", new Error("denied")]) {
    const h = setup(level, 0.4);
    h.wifi();
    assert.equal(h.attrs["data-net-level"], "0.4");
  }
});
test("invalid strength is unavailable, never represented as measured weak Wi-Fi", () => {
  for (const signal of [undefined, null, -1, 2, NaN, "0.2"]) {
    const h = setup(undefined, signal);
    h.wifi();
    assert.equal(h.attrs["data-net-level"], "unknown");
    assert.equal(h.attrs["aria-label"], "Wi-Fi (signal unavailable)");
  }
});
test("unknown and failed network reports never invent Wi-Fi or offline", () => {
  const h = setup();
  h.requests[0].no();
  assert.equal(h.attrs["data-net-kind"], "unknown");
  const off = setup(undefined, undefined, false);
  off.requests[0].no();
  assert.equal(off.attrs["data-net-kind"], "offline");
});
test("late Wi-Fi callbacks cannot overwrite a newer Ethernet report; start is idempotent", () => {
  const h = setup();
  h.requests[0].yes({ networkType: "WIFI" });
  h.A.network.refresh();
  h.requests[2].yes({ networkType: "ETHERNET" });
  h.requests[1].yes({ signalStrength: 0.1 });
  assert.equal(h.attrs["data-net-kind"], "ethernet");
  h.A.network.start();
  assert.equal(h.timers.length, 1);
});

test("network snapshots publish without DOM access and retain identity for unchanged data", () => {
  const h = setup(3, undefined, true, false);
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
  h.A.settings.showNetwork = false;
  h.A.network.updateVisibility();
  assert.equal(h.A.network.getSnapshot().visible, false);
  assert.equal(updates, 2);
  unsubscribe();
  h.A.network.updateVisibility();
  assert.equal(updates, 2);
  assert.deepEqual(h.attrs, {});
});
