"use strict";
const { installApps } = require("./helpers/apps.cjs");
const { installHomeWatcher } = require("./helpers/homewatch.cjs");
const { installNativeNavigation } = require("./helpers/native_navigation.cjs");
const { translateEnglish } = require("./helpers/translate_english.cjs");
const assert = require("node:assert/strict");
const test = require("node:test");
const healthy = { homeControl: { protocol: 1, app_id: "Home", mode: "watcher" }, heartbeats: 1 };

function harness(options = {}) {
  const calls = [],
    requests = [],
    messages = [],
    events = {},
    windowEvents = {},
    scripts = [],
    logs = [],
    fireplaces = [];
  const timers = new Map();
  let clock = 0,
    serial = 0;
  const later = (callback, ms) => {
    const id = ++serial;
    timers.set(id, { callback, at: clock + ms });
    return id;
  };
  const cancel = (id) => timers.delete(id);
  const A = {
    translate: translateEnglish,
    config: { SERVICE_URL: "http://127.0.0.1:47790", SERVICE_ID: "Watcher", APP_ID: "Home" },
    tizen: {
      systeminfo: {
        getCapability: (key) => {
          assert.equal(key, "http://tizen.org/feature/platform.version");
          return options.version || "6.0";
        },
      },
      application: {
        getAppMetaData: () => [],
        getAppsInfo: (done) => done([]),
        launch: (id, success, failed) => calls.push({ id, failed }),
        launchAppControl: (control, id, done) => {
          calls.push({ service: true, id });
          done();
        },
      },
      ApplicationControl: function () {},
    },
    catalog: { preloadedStoreId: (id) => id },
    tiles: { shortName: (name) => name },
    toast: (message) => messages.push(message),
  };
  const document = {
    hidden: true,
    addEventListener: (name, callback) => {
      events[name] = callback;
    },
    removeEventListener: (name, callback) => {
      if (events[name] === callback) delete events[name];
    },
    createElement: () => ({}),
    body: {
      appendChild(script) {
        scripts.push(script);
        script.parentNode = this;
      },
      removeChild(script) {
        script.parentNode = null;
      },
    },
  };
  function XMLHttpRequest() {
    requests.push(this);
  }
  XMLHttpRequest.prototype.open = function (method, url) {
    this.url = url;
  };
  XMLHttpRequest.prototype.send = function () {
    options.onSend?.(this, requests.length);
  };
  XMLHttpRequest.prototype.abort = function () {
    this.aborted = true;
  };
  XMLHttpRequest.prototype.reply = function (value = healthy, status = 200) {
    this.status = status;
    this.responseText = typeof value === "string" ? value : JSON.stringify(value);
    this.onload();
  };
  XMLHttpRequest.prototype.fail = function () {
    this.onerror();
  };
  const window = {
    AeroTizen: A,
    AeroDiagnostics: { record: (event, data) => logs.push({ event, data }), flush() {} },
    Fireplace: { open: () => fireplaces.push(true) },
    addEventListener: (name, callback) => {
      windowEvents[name] = callback;
    },
    removeEventListener: (name) => {
      delete windowEvents[name];
    },
    setTimeout: later,
    clearTimeout: cancel,
  };
  const context = {
    window,
    document,
    XMLHttpRequest,
    setTimeout: later,
    clearTimeout: cancel,
    Date: { now: () => clock },
  };
  installHomeWatcher(context, A.catalog);
  if (options.native) installNativeNavigation(context);
  if (options.apps) installApps(context);
  function advance(ms) {
    const end = clock + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      clock = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    clock = end;
  }
  function loadWrt(reject = false) {
    class Service {
      constructor(id) {
        assert.equal(id, "Watcher");
      }
      start() {
        calls.push({ wrt: true });
        return reject ? Promise.reject(new Error("Rejected")) : Promise.resolve();
      }
    }
    windowEvents["aero-wrt-service"]({ detail: Service });
  }
  return {
    A,
    calls,
    requests,
    messages,
    document,
    events,
    windowEvents,
    scripts,
    logs,
    fireplaces,
    advance,
    loadWrt,
    timers,
    context,
  };
}

test("Samsung Home escape waits for leave acknowledgement then explicitly opens stock Home", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  assert.equal(h.calls.length, 0);
  h.requests[0].reply({ leaving: true });
  assert.equal(h.calls[0].id, "com.samsung.tv.csfs");
  assert.equal(h.A.homewatch.isLeaving(), true);
  h.document.hidden = false;
  h.events.visibilitychange();
  assert.equal(h.A.homewatch.isLeaving(), false);
  assert.ok(h.requests[1].url.endsWith("/home"));
});

test("failed watcher acknowledgement recovers once, then reports bounded failure without launching an app", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  h.requests[0].fail();
  h.requests[1].fail();
  assert.equal(h.messages.length, 0);
  h.advance(30000);
  assert.equal(h.calls.filter((call) => !call.service).length, 0);
  assert.equal(h.messages.length, 1);
  assert.equal(h.A.homewatch.isLeaving(), false);
  assert.equal(h.requests.at(-1).aborted, true);
});

test("failed Samsung launch releases the temporary leave state", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  h.requests[0].reply({ leaving: true });
  h.calls[0].failed();
  assert.equal(h.A.homewatch.isLeaving(), false);
  assert.ok(h.requests[1].url.endsWith("/home"));
});

for (const version of ["10.0"]) {
  test("Tizen " + version + " shares one wrt startup attempt and waits for a valid HTTP reply", async () => {
    const h = harness({ version });
    let ready = 0;
    h.A.homewatch.start(() => ready++);
    h.A.homewatch.start(() => ready++);
    assert.equal(h.requests.length, 1);
    h.requests[0].fail();
    assert.equal(h.scripts.length, 1);
    assert.equal(h.scripts[0].type, "module");
    assert.match(h.scripts[0].textContent, /wrt:service/);
    assert.equal(h.calls.length, 0);
    h.loadWrt();
    await Promise.resolve();
    assert.equal(ready, 0, "start acknowledgement is not readiness");
    h.requests[1].reply({});
    h.advance(200);
    h.requests[2].reply(healthy);
    assert.equal(ready, 2);
    assert.equal(h.calls.length, 1);
    assert.equal(h.windowEvents["aero-wrt-service"], undefined);
    assert.equal(h.scripts[0].parentNode, null);
    assert.equal(h.timers.size, 0);
    assert.ok(h.logs.some((log) => log.event === "service.ready" && log.data.method === "wrt_service"));
  });
}

for (const version of ["6.0", "8.0", "9.0"]) {
  test("Tizen " + version + " keeps AppControl startup but still verifies HTTP readiness", () => {
    const h = harness({ version });
    let ready = 0;
    h.A.homewatch.start(() => ready++);
    h.requests[0].fail();
    assert.equal(h.calls[0].service, true);
    assert.equal(h.scripts.length, 0);
    assert.equal(ready, 0);
    h.requests[1].reply();
    assert.equal(ready, 1);
  });
}

test("an already running service needs no launch or module import", () => {
  const h = harness({ version: "10.0" });
  let ready = 0;
  h.A.homewatch.start(() => ready++);
  h.requests[0].reply();
  assert.equal(ready, 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.scripts.length, 0);
});

test("inventory retry does not restart a service that already answers HTTP", () => {
  const h = harness({ version: "9.0" });
  h.A.homewatch.reportApps(["one"]);
  h.requests[0].reply({});
  let ready = 0;
  h.A.homewatch.start(() => ready++);
  h.requests[1].reply();
  h.requests[2].fail();
  h.advance(200);
  h.requests[3].reply();
  h.requests[4].reply({});
  assert.equal(ready, 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.scripts.length, 0);
});

test("Tizen 9 tries wrt only after the existing start fails its HTTP readiness checks", async () => {
  const h = harness({ version: "9.0" });
  let ready = 0;
  h.A.homewatch.start(() => ready++);
  h.requests[0].fail();
  assert.equal(h.calls[0].service, true);
  h.requests[1].fail();
  h.advance(200);
  assert.equal(h.scripts.length, 0);
  h.advance(1300);
  h.requests[2].fail();
  assert.equal(h.scripts.length, 1);
  assert.equal(ready, 0);
  h.loadWrt();
  await Promise.resolve();
  h.requests[3].reply();
  assert.equal(ready, 1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].wrt, true);
});

test("module errors and timeouts clean up and reject late callbacks", () => {
  for (const timeout of [true, false]) {
    const h = harness({ version: "10.0" });
    let failed = 0;
    h.A.homewatch.start(
      () => assert.fail("unexpected readiness"),
      () => failed++,
    );
    h.requests[0].fail();
    const late = h.windowEvents["aero-wrt-service"];
    if (timeout) h.advance(30000);
    else h.scripts[0].onerror();
    late({
      detail: function () {
        assert.fail("late module cannot start a service");
      },
    });
    h.advance(31000);
    assert.equal(failed, 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.windowEvents["aero-wrt-service"], undefined);
  }
});

test("a rejected wrt start fails once without falling back to the ineffective service operation", async () => {
  const h = harness({ version: "10.0" });
  let failed = 0;
  h.A.homewatch.start(
    () => assert.fail("unexpected readiness"),
    () => failed++,
  );
  h.requests[0].fail();
  h.loadWrt(true);
  await Promise.resolve();
  h.advance(30000);
  assert.equal(failed, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].wrt, true);
});

test("a rejected start can still recover when the existing service answers HTTP", async () => {
  const h = harness({ version: "10.0" });
  let ready = 0;
  h.A.homewatch.start(
    () => ready++,
    () => assert.fail("HTTP proves readiness"),
  );
  h.requests[0].fail();
  h.loadWrt(true);
  await Promise.resolve();
  h.requests[1].reply();
  assert.equal(ready, 1);
});

test("handoff recovery restores app inventory before retrying leave and launching YouTube", async () => {
  const h = harness({ version: "10.0", native: true });
  h.A.homewatch.reportApps(["one", "two"]);
  h.requests[0].reply({});
  let launched = 0;
  h.A.homewatch.suspendForExternal(
    () => launched++,
    () => assert.fail("handoff should recover"),
  );
  h.requests[1].fail();
  h.requests[2].fail();
  h.loadWrt();
  await Promise.resolve();
  h.requests[3].reply();
  assert.match(h.requests[4].url, /\/apps\?ids=one,two$/);
  assert.equal(launched, 0);
  h.requests[4].reply({});
  assert.match(h.requests[5].url, /\/leave$/);
  assert.equal(launched, 0);
  h.requests[5].reply({ leaving: true });
  h.requests[5].reply({ leaving: true });
  assert.equal(launched, 1);
});

test("a recovered request is not retried again and reuses the cached wrt module on later recovery", async () => {
  const h = harness({ version: "10.0" });
  let failed = 0;
  h.A.homewatch.request(
    "/leave",
    () => assert.fail("unexpected reply"),
    () => failed++,
  );
  h.requests[0].fail();
  h.requests[1].fail();
  h.loadWrt();
  await Promise.resolve();
  h.requests[2].reply();
  h.requests[3].fail();
  h.requests[3].fail();
  assert.equal(failed, 1);
  assert.equal(h.calls.length, 1);
  h.A.homewatch.start();
  h.requests[4].fail();
  h.requests[5].reply();
  assert.equal(h.calls.length, 2);
  assert.equal(h.scripts.length, 1);
});

test("a malformed leave acknowledgement cannot launch an external app", () => {
  const h = harness({ native: true });
  let failed = 0;
  h.A.homewatch.suspendForExternal(
    () => assert.fail("must wait for pause"),
    () => failed++,
  );
  h.requests[0].reply({});
  assert.equal(failed, 1);
});

test("an unanswered service probe times out and ignores its late reply", () => {
  const h = harness({ version: "10.0" });
  let failed = 0;
  h.A.homewatch.start(
    () => assert.fail("unexpected readiness"),
    () => failed++,
  );
  h.advance(30000);
  h.requests[0].reply();
  assert.equal(failed, 1);
  assert.equal(h.requests[0].aborted, true);
  assert.equal(h.scripts.length, 0);
});

test("startup diagnostics cannot trigger a service launch", () => {
  const h = harness();
  h.A.homewatch.reportStartup({ script_at: 1 });
  h.requests[0].fail();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.length, 0);
});

test("an app launch waits for its recovered watch acknowledgement", async () => {
  const h = harness({ version: "10.0", native: true });
  let launches = 0;
  h.A.homewatch.prepareAppLaunch(
    "regular.app",
    () => launches++,
    () => assert.fail("must recover"),
  );
  h.requests[0].fail();
  h.requests[1].fail();
  h.loadWrt();
  await Promise.resolve();
  h.requests[2].reply();
  assert.equal(launches, 0);
  h.requests[3].reply({ watched: "regular.app" });
  assert.equal(launches, 1);
});

test("an old home recovery cannot rearm the watcher after a newer leave request", async () => {
  const h = harness({ version: "10.0" });
  h.A.homewatch.request("/home");
  h.requests[0].fail();
  h.A.homewatch.request("/leave", () => {});
  h.requests[2].fail();
  h.requests[1].fail();
  h.loadWrt();
  await Promise.resolve();
  h.requests[3].reply();
  assert.equal(h.requests.length, 5);
  assert.match(h.requests[4].url, /\/leave$/);
  h.requests[4].reply({ leaving: true });
});

test("inventory changed during recovery is restored before readiness", async () => {
  const h = harness({ version: "10.0" });
  h.A.homewatch.reportApps(["old"]);
  h.requests[0].reply({});
  let ready = 0;
  h.A.homewatch.start(() => ready++);
  h.requests[1].fail();
  h.loadWrt();
  await Promise.resolve();
  h.requests[2].reply();
  h.A.homewatch.reportApps(["new"]);
  h.requests[4].reply({});
  h.requests[3].reply({});
  assert.equal(ready, 0);
  assert.match(h.requests[5].url, /\/apps\?ids=new$/);
  h.requests[5].reply({});
  assert.equal(ready, 1);
});

for (const { name, open } of [
  { name: "YouTube", open: (h) => h.A.apps.launch({ id: "youtube.app", name: "YouTube" }) },
  { name: "Samsung Home", open: (h) => h.A.homewatch.openSamsungHome() },
  { name: "native viewer", open: (h) => h.A.homewatch.openNativeViewer({ type: "TV", number: 1 }) },
]) {
  for (const stage of ["late reply", "HTTP failure", "recovery ready", "recovery timeout"]) {
    test("superseded " + name + " at " + stage + " leaves the newer app launch intact", () => {
      const h = harness({ version: "9.0", native: true, apps: true });
      open(h);
      assert.match(h.requests[0].url, /\/leave$/);
      const recovering = stage.startsWith("recovery");
      if (recovering) h.requests[0].fail();
      h.A.apps.launch({ id: "regular.app", name: "Regular" });
      let watch = h.requests.at(-1);
      assert.match(watch.url, /\/watch\?id=regular.app$/);
      if (stage === "late reply") h.requests[0].reply({ leaving: true });
      if (stage === "HTTP failure") h.requests[0].fail();
      if (stage === "recovery ready") {
        watch.fail();
        h.requests[1].reply();
        watch = h.requests.at(-1);
        assert.match(watch.url, /\/watch\?id=regular.app$/);
      }
      watch.reply({ watched: "regular.app" });
      if (stage === "recovery timeout") h.advance(30000);
      assert.deepEqual(
        h.calls.map((call) => call.id),
        ["regular.app"],
      );
      assert.deepEqual(h.messages, []);
      assert.ok(h.requests.every((request) => !request.url.endsWith("/home")));
      const expectedRequests = recovering ? 3 : 2;
      assert.equal(h.requests.length, stage === "recovery ready" ? expectedRequests + 1 : expectedRequests);
      const before = h.requests.length;
      open(h);
      assert.equal(h.requests.length, before + 1, "the cancelled handoff releases its pending guard");
    });
  }
}

for (const action of ["app", "store", "fireplace"]) {
  test("a superseded " + action + " preparation releases its guard without launching a fallback", () => {
    const h = harness({ version: "10.0", native: true, apps: true });
    if (action === "app") h.A.apps.launch({ id: "old.app", name: "Old" });
    if (action === "store") {
      h.A.config.STORE_APP_IDS = ["store.one", "store.two"];
      h.A.apps.openStore();
    }
    if (action === "fireplace") {
      h.A.tizen.application.getAppsInfo = (done) => done([{ id: "youtube.app", name: "YouTube" }]);
      h.A.config.STORE_PACKAGE = /^$/;
      h.A.config.HIDDEN_APPS = /service/;
      h.A.apps.load();
      h.A.apps.playFireplace();
    }
    h.A.homewatch.openSamsungHome();
    const watched = decodeURIComponent(h.requests[0].url.split("id=")[1]);
    h.requests[0].reply({ watched });
    h.requests[1].reply({ leaving: true });
    assert.deepEqual(
      h.calls.map((call) => call.id),
      ["com.samsung.tv.csfs"],
    );
    assert.deepEqual(h.messages, []);
    assert.deepEqual(h.fireplaces, []);
    assert.equal(h.requests.length, 2, "cancelled store launch does not try another ID");
    h.A.apps.launch({ id: "next.app", name: "Next" });
    h.requests[2].reply({ watched: "next.app" });
    assert.deepEqual(
      h.calls.map((call) => call.id),
      ["com.samsung.tv.csfs", "next.app"],
    );
  });
}

test("cancelling an older stock Home escape preserves the newer leave state", () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  h.A.homewatch.useSamsungHome();
  h.requests[0].reply({ leaving: true });
  assert.equal(h.A.homewatch.isLeaving(), true);
  h.requests[1].reply({ leaving: true });
  assert.deepEqual(
    h.calls.map((call) => call.id),
    ["com.samsung.tv.csfs"],
  );
  assert.deepEqual(h.messages, []);
});

test("typed watcher remains idle after readiness and retains request deadlines", () => {
  const h = harness({ version: "10.0" });
  h.A.homewatch.start();
  assert.equal(h.requests[0].timeout, 750);
  h.requests[0].reply();
  h.advance(60000);
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
  h.A.homewatch.request("/home");
  assert.equal(h.requests[1].timeout, 1500);
});

test("typed watcher disposal releases module loading, requests, timers and visibility listener", () => {
  const h = harness({ version: "10.0" });
  let delivered = 0;
  h.A.homewatch.start(
    () => delivered++,
    () => delivered++,
  );
  h.requests[0].fail();
  const lateModule = h.windowEvents["aero-wrt-service"];
  const lateError = h.scripts[0].onerror;
  h.A.homewatch.request(
    "/leave",
    () => delivered++,
    () => delivered++,
  );
  h.A.homewatch.dispose();
  h.A.homewatch.dispose();
  assert.equal(h.requests[1].aborted, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.visibilitychange, undefined);
  assert.equal(h.windowEvents["aero-wrt-service"], undefined);
  assert.equal(h.scripts[0].parentNode, null);
  lateModule({
    detail: function () {
      assert.fail("late native module started");
    },
  });
  lateError();
  h.requests[1].reply({ leaving: true });
  h.advance(60000);
  h.A.homewatch.start();
  h.A.homewatch.reportApps(Object.freeze(["next.app"]));
  h.A.homewatch.reportStartup({ script_at: 1 });
  h.A.homewatch.watch("next.app");
  h.A.homewatch.useSamsungHome();
  assert.equal(delivered, 0);
  assert.equal(h.requests.length, 2);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.messages, []);
});

test("typed watcher disposal aborts readiness and cancels a scheduled retry", () => {
  for (const awaitingReply of [true, false]) {
    const h = harness({ version: "9.0" });
    h.A.homewatch.start();
    h.requests[0].fail();
    if (!awaitingReply) h.requests[1].fail();
    h.A.homewatch.dispose();
    h.requests[1].reply();
    h.advance(60000);
    assert.equal(h.timers.size, 0);
    assert.equal(h.requests.length, 2);
    if (awaitingReply) assert.equal(h.requests[1].aborted, true);
  }
});

test("typed watcher ignores native promise rejection and launch failure after disposal", async () => {
  const h = harness({ version: "10.0" });
  h.A.homewatch.start();
  h.requests[0].fail();
  h.loadWrt(true);
  h.A.homewatch.useSamsungHome();
  h.requests.at(-1).reply({ leaving: true });
  const lateFailure = h.calls.at(-1).failed;
  h.A.homewatch.dispose();
  lateFailure();
  await Promise.resolve();
  h.advance(60000);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.messages, []);
  assert.equal(h.requests.length, 3);
});

test("typed watcher aborts the current probe when a synchronous initial failure starts recovery", () => {
  const h = harness({
    version: "9.0",
    onSend(request, count) {
      if (count === 1) request.fail();
    },
  });
  let failed = 0;
  h.A.homewatch.start(undefined, () => failed++);
  h.advance(30000);
  assert.equal(failed, 1);
  assert.equal(h.requests[1].aborted, true);
  assert.equal(h.timers.size, 0);
});

test("typed watcher has no TV activity in browser mode", () => {
  const h = harness();
  h.A.homewatch.dispose();
  h.A.tizen = null;
  const watcher = installHomeWatcher(h.context);
  let failed = 0;
  watcher.start(undefined, () => failed++);
  watcher.reportApps(Object.freeze(["app"]));
  watcher.request("/leave");
  watcher.useSamsungHome();
  assert.equal(failed, 1);
  assert.equal(h.requests.length, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.messages.length, 1);
  watcher.dispose();
});

test("typed watcher cleanup continues if abort throws on a lost transport", () => {
  const h = harness();
  h.A.homewatch.start();
  h.requests[0].abort = () => {
    throw new Error("closed transport");
  };
  assert.doesNotThrow(() => h.A.homewatch.dispose());
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.visibilitychange, undefined);
});
