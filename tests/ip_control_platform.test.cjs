const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createIpControlPlatform } = loadTypeScript("launcher/src/platform/tizen/createIpControlPlatform.ts");

function harness() {
  const timers = new Map();
  const listeners = new Map();
  const messages = [];
  let nextId = 0;
  let start;
  const local = {
    addMessagePortListener(fn) {
      const id = ++nextId;
      listeners.set(id, fn);
      return id;
    },
    removeMessagePortListener(id) {
      listeners.delete(id);
    },
  };
  const platform = createIpControlPlatform({
    setTimeout(fn) {
      const id = ++nextId;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    AeroTizen: {
      config: { SERVICE_ID: "test.Service" },
      homewatch: {
        start(ready) {
          start = ready;
        },
      },
      tizen: {
        messageport: {
          requestTrustedLocalMessagePort: () => local,
          requestTrustedRemoteMessagePort(id, name) {
            assert.equal(id, "test.Service");
            assert.equal(name, "AeroTizen.IpControlProbe");
            return {
              sendMessage(items) {
                messages.push(items);
              },
            };
          },
        },
      },
    },
  });
  return {
    platform,
    messages,
    listeners,
    timers,
    ready: () => start(),
    reply(value, key = messages[0][0].key) {
      for (const fn of listeners.values()) fn([{ key, value: JSON.stringify(value) }]);
    },
  };
}

test("IP Control waits for service readiness and releases its reply listener and deadline", async () => {
  const h = harness();
  const request = h.platform.request({ action: "list" });
  assert.equal(h.messages.length, 0);
  h.ready();
  assert.equal(h.messages.length, 1);
  h.reply({ status: "listed", ports: [5] }, "different-request");
  assert.equal(h.listeners.size, 1);
  h.reply({ status: "listed", ports: [5] });
  assert.deepEqual(await request, { status: "listed", ports: [5] });
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.platform.dispose();
});

test("disposal settles requests and prevents late readiness or replies from sending commands", async () => {
  for (const ready of [false, true]) {
    const h = harness();
    const request = h.platform.request({ action: "learn", nativePorts: [] });
    if (ready) h.ready();
    h.platform.dispose();
    h.ready();
    assert.equal(await request, null);
    assert.equal(h.messages.length, Number(ready));
    assert.equal(h.listeners.size, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(await h.platform.request({ action: "list" }), null);
  }
});

test("a request timeout releases the trusted message listener", async () => {
  const h = harness();
  const request = h.platform.request({ action: "switch", port: 5 });
  h.ready();
  for (const callback of h.timers.values()) callback();
  assert.equal(await request, null);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});
