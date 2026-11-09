const { translateEnglish } = require("./helpers/translate_english.cjs");
("use strict");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(__dirname + "/../launcher/js/homewatch.js", "utf8");
function harness(options = {}) {
  const calls = [],
    requests = [],
    messages = [],
    events = {},
    windowEvents = {},
    scripts = [],
    timers = [];
  const A = {
    translate: translateEnglish,
    config: { SERVICE_URL: "http://127.0.0.1:47790", SERVICE_ID: "Watcher" },
    tizen: {
      systeminfo: { getCapability: () => options.version || "6.0" },
      application: {
        launch: (id, success, failed) => calls.push({ id, failed }),
        launchAppControl: () => calls.push({ service: true }),
      },
      ApplicationControl: function () {},
    },
    catalog: { preloadedStoreId: (id) => id },
    toast: (message) => messages.push(message),
  };
  const document = {
    hidden: true,
    addEventListener: (name, callback) => {
      events[name] = callback;
    },
    createElement: () => ({}),
    body: { appendChild: (script) => scripts.push(script) },
  };
  function XMLHttpRequest() {
    requests.push(this);
  }
  XMLHttpRequest.prototype.open = function (method, url) {
    this.url = url;
  };
  XMLHttpRequest.prototype.send = function () {};
  vm.runInNewContext(source, {
    window: {
      AeroTizen: A,
      addEventListener: (name, callback) => {
        windowEvents[name] = callback;
      },
      removeEventListener: (name) => {
        delete windowEvents[name];
      },
    },
    document,
    XMLHttpRequest,
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
  });
  return { A, calls, requests, messages, document, events, windowEvents, scripts, timers };
}
test("Samsung Home escape waits for leave acknowledgement then explicitly opens stock Home", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  assert.equal(h.calls.length, 0);
  const request = h.requests[0];
  request.status = 200;
  request.responseText = '{"leaving":true}';
  request.onload();
  assert.equal(h.calls[0].id, "com.samsung.tv.csfs");
  assert.equal(h.A.homewatch.isLeaving(), true);
  h.document.hidden = false;
  h.events.visibilitychange();
  assert.equal(h.A.homewatch.isLeaving(), false);
  assert.ok(h.requests[1].url.endsWith("/home"));
});
test("failed watcher acknowledgement cannot launch or exit an app", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  h.requests[0].ontimeout();
  assert.equal(h.calls.length, 0);
  assert.equal(h.messages.length, 1);
  assert.equal(h.A.homewatch.isLeaving(), false);
});
test("failed Samsung launch releases the temporary leave state", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  h.requests[0].status = 200;
  h.requests[0].responseText = '{"leaving":true}';
  h.requests[0].onload();
  h.calls[0].failed();
  assert.equal(h.A.homewatch.isLeaving(), false);
  assert.ok(h.requests[1].url.endsWith("/home"));
});

test("the test screen starts Tizen 10 services through wrt with bounded completion", async () => {
  const h = harness({ version: "10.0" });
  let accepted = 0,
    failed = 0;
  h.A.homewatch.ensureService(
    () => accepted++,
    () => failed++,
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.scripts[0].type, "module");
  assert.ok(h.scripts[0].textContent.includes("wrt:service"));
  class Service {
    constructor(id) {
      assert.equal(id, "Watcher");
    }
    start() {
      return Promise.resolve();
    }
  }
  h.windowEvents["aero-native-home-service"]({ detail: Service });
  await Promise.resolve();
  h.timers[0]();
  assert.equal(accepted, 1);
  assert.equal(failed, 0);
  assert.equal(h.windowEvents["aero-native-home-service"], undefined);
});

test("module failure is reported once and older TVs use the existing service operation", () => {
  const h = harness({ version: "10.0" });
  let failed = 0;
  h.A.homewatch.ensureService(
    () => assert.fail("unexpected success"),
    () => failed++,
  );
  h.scripts[0].onerror();
  h.timers[0]();
  assert.equal(failed, 1);
  const older = harness();
  let accepted = 0;
  older.A.homewatch.ensureService(
    () => accepted++,
    () => assert.fail("unexpected failure"),
  );
  assert.equal(accepted, 1);
  assert.equal(older.scripts.length, 0);
  assert.equal(older.calls[0].service, true);
});
