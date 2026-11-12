const { installApps } = require("./helpers/apps.cjs");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createTestSettings } = require("./helpers/settings.cjs");
const { translateEnglish } = require("./helpers/translate_english.cjs");
("use strict");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { installNativeNavigation } = require("./helpers/native_navigation.cjs");

const get = (file) => fs.readFileSync(path.join(__dirname, "../launcher/", file), "utf8");
const { installInputs } = require("./helpers/inputs.cjs");
const { launcherConfig } = loadTypeScript("launcher/src/launcherConfig.ts");
const { createDiagnostics } = loadTypeScript("launcher/src/diagnostics/createDiagnostics.ts");

function harness(options = {}) {
  const requests = [],
    launches = [],
    inputs = [],
    embedded = [],
    toasts = [],
    timers = [],
    backgrounds = [];
  const listeners = {},
    documentListeners = {},
    documentHandlers = {},
    watch = [],
    resume = [];
  const log = createDiagnostics("ui", {
    later: (fn, ms) => {
      timers.push({ fn, ms });
    },
  });
  function Request() {
    this.status = 0;
    this.abort = () => {
      this.aborted = true;
      this.onabort?.();
    };
    this.open = (method, url) => {
      this.method = method;
      this.url = url;
    };
    this.send = () => {
      requests.push(this);
    };
    this.resolve = (status) => {
      this.status = status;
      if (this.onload) this.onload();
    };
    this.fail = () => {
      if (this.onerror) this.onerror();
    };
  }
  const tz = {
    filesystem: options.filesystem,
    ApplicationControl: function (op) {
      this.operation = op;
    },
    application: {
      getAppMetaData() {
        return [];
      },
      getCurrentApplication() {
        return {
          getRequestedAppControl() {
            return {
              appControl: {
                operation: options.operation || "http://tizen.org/appcontrol/operation/main",
              },
            };
          },
        };
      },
      launch(id, success, failure) {
        launches.push({ id, method: "launch" });
        if (options.launchFails && (id === options.launchFails || options.launchFails === true)) {
          if (failure) failure({ name: "Denied" });
        } else if (success) success();
      },
      launchAppControl(control, id, success, failure) {
        launches.push({ id, method: "appcontrol" });
        if (options.appControlFails) {
          if (failure) failure({ name: "Denied" });
        } else if (success) success();
      },
    },
    systeminfo: {
      addPropertyValueChangeListener() {},
      getCapability(key) {
        if (key === "http://tizen.org/feature/platform.version" && options.platform) return options.platform;
        throw new Error("unsupported capability");
      },
    },
    tvwindow: {
      setSource(source, success, failure, target) {
        inputs.push({ source, target });
        if (options.sourceFails) failure({ name: "InvalidValuesError" });
        else success();
      },
      show(success) {
        embedded.push("shown");
        if (success) success();
      },
      hide() {
        embedded.push("hidden");
      },
    },
  };
  if (options.noNativeLaunch) {
    delete tz.application.launch;
  }
  if (options.noAppControl) {
    delete tz.ApplicationControl;
    delete tz.application.launchAppControl;
  }
  const document = {
    addEventListener(name, handler) {
      if (!documentHandlers[name]) {
        documentHandlers[name] = [];
        documentListeners[name] = () => documentHandlers[name].slice().forEach((callback) => callback());
      }
      documentHandlers[name].push(handler);
    },
    removeEventListener(name, handler) {
      const handlers = documentHandlers[name] || [];
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    },
    hidden: options.visible === true ? false : true,
    body: { classList: { add() {}, remove() {} } },
    documentElement: { style: {} },
  };
  const A = {
    translate: translateEnglish,
    tizen: tz,
    config: {
      SERVICE_URL: "http://127.0.0.1:47790",
      STORE_PACKAGE: /^[A-Za-z0-9]{10}$/,
      HIDDEN_APPS: /service/i,
      HBBTV_APP_ID: "org.tizen.hbbtv",
      HBBTV_LINK_METADATA: "hbbtv.link",
      DEFAULT_HOME_APPS: [],
      FIREPLACE_ID: "__fire",
      STORE_APP_IDS: options.storeIds || [],
    },
    homewatch: {
      watch(id, done) {
        watch.push(id);
        if (done) done();
      },
      resume() {
        resume.push(true);
      },
      useSamsungHome() {},
    },
    catalog: {
      preloadedStoreId() {
        return null;
      },
    },
    settings: createTestSettings({ inputNames: {}, showLiveTv: true, hideDisconnectedHdmi: false }),
    tiles: {
      shortName: (name) => name,
      ICONS: { tv: "tv", hdmi: "hdmi", box: "box", pc: "pc", game: "game" },
    },
    toast: (message) => toasts.push(message),
    applyBackground: () => backgrounds.push("restored"),
  };
  const window = {
    AeroTizen: A,
    AeroDiagnostics: log,
    addEventListener(name, handler) {
      listeners[name] = handler;
    },
    removeEventListener(name, handler) {
      if (listeners[name] === handler) delete listeners[name];
    },
    setInterval() {},
    setTimeout(fn, ms) {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timers.splice(timers.indexOf(timer), 1);
    },
    Backgrounds: { suspend: () => backgrounds.push("suspended") },
  };
  const context = { window, document, XMLHttpRequest: Request };
  installNativeNavigation(context);
  installInputs(context);
  A.inputs.start();
  installApps(context);
  return {
    A,
    backgrounds,
    tz,
    requests,
    launches,
    inputs,
    embedded,
    watch,
    resume,
    toasts,
    timers,
    listeners,
    document,
    documentListeners,
    documentHandlers,
    log,
  };
}

test("typed disposal cancels routing reads and ignores late file replies", () => {
  const storage = routingStorage();
  const h = harness({ filesystem: storage.filesystem });
  h.A.homewatch.openSamsungHome();
  assert.equal(h.timers.filter((timer) => timer.ms === 500).length, 1);
  h.A.nativeNavigation.dispose();
  assert.equal(h.timers.filter((timer) => timer.ms === 500).length, 0);
  storage.reads[0](nativeRouting);
  assert.deepEqual(h.launches, []);
  assert.deepEqual(h.requests, []);
  assert.deepEqual(h.toasts, []);
});

test("typed disposal aborts fallback requests and suppresses late delivery", () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  const request = h.requests[0];
  assert.equal(request.timeout, 1500);
  h.A.nativeNavigation.dispose();
  assert.equal(request.aborted, true);
  request.resolve(200);
  request.fail();
  h.A.nativeNavigation.dispose();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.launches, []);
  assert.deepEqual(h.toasts, []);
});

test("typed disposal still clears listeners when request abort throws", () => {
  const h = harness({ visible: true });
  const listeners = h.documentHandlers.visibilitychange.length;
  h.A.homewatch.openNativeViewer();
  h.requests[0].abort = () => {
    throw new Error("already closed");
  };
  h.A.nativeNavigation.dispose();
  assert.equal(h.listeners.load, undefined);
  assert.equal(h.documentHandlers.visibilitychange.length, listeners);
});

for (const method of ["request", "watch"]) {
  test(`typed disposal suppresses late watcher ${method} callbacks`, () => {
    const h = harness();
    let ready;
    let failed;
    let delivered = 0;
    h.A.homewatch[method] = (_id, success, failure) => {
      ready = success;
      failed = failure;
    };
    if (method === "request") h.A.homewatch.openSamsungHome();
    else
      h.A.homewatch.prepareAppLaunch(
        "app",
        () => delivered++,
        () => delivered++,
      );
    h.A.nativeNavigation.dispose();
    ready({ leaving: true });
    failed("late failure");
    assert.equal(delivered, 0);
    assert.deepEqual(h.launches, []);
    assert.deepEqual(h.toasts, []);
  });
}

test("typed disposal prevents a delayed source callback from launching the viewer", () => {
  const h = harness({ visible: true });
  let complete;
  h.tz.tvwindow.setSource = (_source, ready) => {
    complete = ready;
  };
  h.A.homewatch.openNativeViewer({ type: "HDMI", number: 1 });
  h.requests[0].resolve(200);
  h.A.nativeNavigation.dispose();
  complete();
  assert.deepEqual(h.launches, []);
  assert.deepEqual(h.toasts, []);
});

for (const viewer of [false, true]) {
  test(`typed disposal ignores delayed ${viewer ? "viewer" : "Home"} SDK callbacks`, () => {
    const h = harness({ visible: true });
    const listeners = h.documentHandlers.visibilitychange.length;
    let ready;
    let failed;
    h.tz.application.launch = (_id, success, failure) => {
      ready = success;
      failed = failure;
    };
    if (viewer) h.A.homewatch.openNativeViewer();
    else h.A.homewatch.openSamsungHome();
    h.requests[0].resolve(200);
    h.A.nativeNavigation.dispose();
    ready();
    failed();
    assert.deepEqual(h.launches, []);
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.toasts, []);
    assert.equal(h.documentHandlers.visibilitychange.length, listeners);
  });
}

test("typed disposal removes focus checks and makes future commands inert", () => {
  const h = harness({ visible: true });
  const listeners = h.documentHandlers.visibilitychange.length;
  h.A.homewatch.openNativeViewer();
  h.requests[0].resolve(200);
  const focus = h.timers.find((timer) => timer.ms === 2100);
  assert.ok(focus);
  assert.equal(h.documentHandlers.visibilitychange.length, listeners + 1);
  h.A.nativeNavigation.dispose();
  focus.fn();
  h.documentListeners.visibilitychange();
  h.A.nativeNavigation.start();
  h.A.homewatch.resume();
  h.A.homewatch.openSamsungHome();
  h.A.homewatch.prepareAppLaunch("app", assert.fail, assert.fail);
  h.A.homewatch.suspendForExternal(assert.fail, assert.fail);
  assert.equal(h.A.homewatch.openNativeViewer(), false);
  assert.equal(h.listeners.load, undefined);
  assert.equal(h.timers.filter((timer) => timer.ms === 2100).length, 0);
  assert.equal(h.documentHandlers.visibilitychange.length, listeners);
  assert.equal(h.requests.length, 1);
  assert.equal(h.launches.length, 1);
  assert.deepEqual(h.toasts, []);
});

const nativeRouting = {
  mode: "native",
  transaction: "a".repeat(32),
  baseline_sha256: "b".repeat(64),
};
const watcherRouting = { mode: "watcher", transaction: null, baseline_sha256: null };
const leaveUrl = "http://127.0.0.1:47790/leave";

function routingStorage() {
  const reads = [];
  return {
    reads,
    filesystem: {
      resolve(filePath, success, failure, mode) {
        assert.equal(filePath, "wgt-private/aerotizen-home-routing-v1.json");
        assert.equal(mode, "r");
        reads.push((routing) => {
          if (routing === undefined) {
            failure({ name: "NotFoundError" });
          } else {
            const text = JSON.stringify(routing);
            success({ fileSize: text.length, readAsText: (read) => read(text) });
          }
        });
      },
    },
  };
}

const handoffs = [
  { name: "YouTube", id: "youtube.app", open: (A) => A.apps.launch({ id: "youtube.app", name: "YouTube" }) },
  { name: "Samsung Home", id: "com.samsung.tv.csfs", open: (A) => A.homewatch.openSamsungHome() },
  { name: "Live TV", id: "org.tizen.tv-viewer", open: (A) => A.inputs.show({ type: "TV", number: 1 }) },
];

for (const { name, id, open } of handoffs) {
  for (const { mode, routing } of [
    { mode: "Native Home", routing: nativeRouting },
    { mode: "Watcher mode", routing: watcherRouting },
    { mode: "unknown mode", routing: undefined },
  ]) {
    test(`${name} skips /leave only in confirmed Native Home (${mode})`, () => {
      const storage = routingStorage();
      const h = harness(storage);
      open(h.A);
      assert.deepEqual(h.launches, []);
      assert.deepEqual(h.requests, []);
      assert.equal(storage.reads.length, 1);
      storage.reads[0](routing);

      if (routing === nativeRouting) {
        assert.deepEqual(h.requests, []);
      } else {
        assert.deepEqual(h.launches, []);
        assert.deepEqual(
          h.requests.map((request) => request.url),
          [leaveUrl],
        );
        h.requests[0].resolve(200);
      }
      assert.deepEqual(h.launches, [{ id, method: "launch" }]);
    });
  }
}

test("a later handoff reads Home routing again and rejects an incomplete Native Home record", () => {
  const storage = routingStorage();
  const h = harness(storage);
  h.A.homewatch.openSamsungHome();
  storage.reads[0](nativeRouting);
  h.A.homewatch.openSamsungHome();
  storage.reads[1]({ mode: "native" });
  assert.equal(h.launches.length, 1);
  assert.equal(h.requests[0].url, leaveUrl);
});

test("a late Native Home read cannot bypass a /leave already requested after a storage timeout", () => {
  const storage = routingStorage();
  const h = harness(storage);
  h.A.homewatch.openSamsungHome();
  h.timers[0].fn();
  storage.reads[0](nativeRouting);
  assert.deepEqual(h.launches, []);
  assert.deepEqual(
    h.requests.map((request) => request.url),
    [leaveUrl],
  );
  h.requests[0].fail();
  assert.deepEqual(h.launches, []);
  assert.match(h.toasts[0], /HomeWatcher unavailable/);
});

test("YouTube/Cobalt waits for a confirmed /leave before starting", () => {
  const h = harness();
  h.A.apps.launch({ id: "youtube.app", name: "YouTube" });
  assert.equal(h.launches.length, 0);
  assert.deepEqual(
    h.requests.map((r) => r.url),
    ["http://127.0.0.1:47790/leave"],
  );
  h.requests[0].resolve(200);
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["youtube.app"],
  );
  assert.equal(h.watch.length, 0);
  assert.equal(h.resume.length, 0, "watcher stays paused until return to AeroTizen");
});

test("Tizen 10 watches YouTube like other apps instead of pausing the watcher", () => {
  const h = harness({ platform: "10.0" });
  h.A.apps.launch({ id: "youtube.app", name: "YouTube" });
  assert.ok(
    h.requests.every((r) => !r.url.endsWith("/leave")),
    "no /leave pause on Tizen 10",
  );
  assert.deepEqual(h.watch, ["youtube.app"]);
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["youtube.app"],
  );
});

test("repeat taps while a launch waits for HomeWatcher are ignored", () => {
  const h = harness();
  let release;
  h.A.homewatch.prepareAppLaunch = (id, ready) => {
    h.watch.push(id);
    release = ready;
  };
  h.A.apps.launch({ id: "app.one", name: "One" });
  h.A.apps.launch({ id: "app.one", name: "One" });
  h.A.apps.launch({ id: "app.two", name: "Two" });
  assert.deepEqual(h.watch, ["app.one"], "later taps wait for the first handoff");
  release();
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["app.one"],
  );
  h.A.apps.launch({ id: "app.two", name: "Two" });
  assert.deepEqual(h.watch, ["app.one", "app.two"], "a new tap works once the first settles");
});

test("YouTube rejects an unavailable /leave handoff without racing the watcher", () => {
  const h = harness();
  h.A.apps.launch({ id: "youtube.app", name: "YouTube" });
  h.requests[0].resolve(503);
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
  assert.match(h.toasts[0], /HomeWatcher HTTP 503/);
});

test("double HTTP callbacks never launch YouTube more than once", () => {
  const h = harness();
  h.A.apps.launch({ id: "youtube.app", name: "YouTube" });
  h.requests[0].resolve(200);
  h.requests[0].resolve(200);
  assert.equal(h.launches.length, 1);
});

test("denied YouTube launch rearms HomeWatcher", () => {
  const h = harness({ launchFails: "youtube.app" });
  h.A.apps.launch({ id: "youtube.app", name: "YouTube" });
  h.requests[0].resolve(200);
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
  assert.match(h.toasts[0], /Could not open YouTube/);
});

test("regular apps still use the original /watch launch sequence", () => {
  const h = harness();
  h.A.apps.launch({ id: "netflix.app", name: "Netflix" });
  assert.deepEqual(h.watch, ["netflix.app"]);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["netflix.app"],
  );
});

test("confirmed Native Home app launches keep working without a watcher acknowledgement", () => {
  const storage = routingStorage();
  const h = harness(storage);
  h.A.apps.launch({ id: "netflix.app", name: "Netflix" });
  assert.equal(h.launches.length, 0);
  storage.reads[0](nativeRouting);
  assert.deepEqual(h.watch, []);
  assert.deepEqual(h.launches, [{ id: "netflix.app", method: "launch" }]);
});

test("Samsung Home requires the /leave acknowledgement", () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  h.A.homewatch.openSamsungHome();
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(200);
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["com.samsung.tv.csfs"],
  );
  assert.equal(h.requests.length, 1);
});

test("Samsung Home failed /leave does not launch and rearms the service", () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  h.requests[0].resolve(503);
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
});

test("Samsung Home launch rejection uses native AppControl fallback", () => {
  const h = harness({ launchFails: "com.samsung.tv.csfs" });
  h.A.homewatch.openSamsungHome();
  h.requests[0].resolve(200);
  assert.deepEqual(
    h.launches.map((r) => r.method),
    ["launch", "appcontrol"],
  );
});

test("native Live TV uses the tested /leave before tuning and launching viewer", () => {
  const h = harness();
  const raw = { type: "TV", number: 1 };
  h.A.inputs.show({ type: "TV", number: 1, raw });
  assert.equal(h.launches.length, 0);
  assert.equal(h.inputs.length, 0);
  assert.equal(h.requests[0].url, "http://127.0.0.1:47790/leave");
  h.requests[0].resolve(200);
  assert.equal(h.inputs.length, 1);
  assert.equal(h.inputs[0].source, raw);
  assert.equal(h.inputs[0].target, "MAIN");
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["org.tizen.tv-viewer"],
  );
  assert.equal(h.embedded.length, 0);
});

test("native Live TV failed handoff never launches and rearms the service", () => {
  const h = harness();
  h.A.inputs.show({ type: "TV", number: 1 });
  h.requests[0].fail();
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
});

test("native Live TV launch failure reports error and rearms the service", () => {
  const h = harness({ launchFails: "org.tizen.tv-viewer", noAppControl: true });
  h.A.inputs.show({ type: "TV", number: 1 });
  h.requests[0].resolve(200);
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
  assert.match(h.toasts[0], /Could not open Live TV/);
});

test("old firmware without the viewer launch API uses upstream TVWindow", () => {
  const h = harness({ noNativeLaunch: true });
  h.A.inputs.show({ type: "TV", number: 1 });
  assert.equal(h.requests.length, 0);
  assert.equal(h.embedded.length, 1);
});

test("HDMI uses TVWindow by default", () => {
  const h = harness();
  h.A.inputs.show({ type: "HDMI", number: 2 });
  assert.equal(h.embedded.length, 1);
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests.length, 0);
});

test("missing input selection does not start playback", () => {
  const h = harness();
  h.A.inputs.show(null);
  assert.deepEqual(h.inputs, []);
  assert.deepEqual(h.requests, []);
});

test("opt-in HDMI handoff waits for /leave and selects the raw source before opening Samsung viewer", () => {
  const h = harness();
  h.A.settings.update({ hdmiNativeViewer: true });
  const raw = { type: "HDMI", number: 2, signal: false };
  h.A.inputs.show({ type: "HDMI", number: 2, raw });
  h.A.inputs.show({ type: "HDMI", number: 3 });
  assert.equal(h.launches.length, 0);
  assert.equal(h.inputs.length, 0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, "http://127.0.0.1:47790/leave");
  h.requests[0].resolve(200);
  assert.deepEqual(h.inputs, [{ source: raw, target: "MAIN" }]);
  assert.equal(h.inputs[0].source, raw);
  assert.deepEqual(h.launches, [{ id: "org.tizen.tv-viewer", method: "launch" }]);
  assert.deepEqual(h.embedded, []);
  assert.equal(h.log.snapshot().records[0].data.action, "hdmi");
});

test("opt-in HDMI uses TVWindow if the launch API is unavailable", () => {
  const h = harness({ noNativeLaunch: true });
  h.A.settings.update({ hdmiNativeViewer: true });
  h.A.inputs.show({ type: "HDMI", number: 2 });
  assert.deepEqual(h.requests, []);
  assert.deepEqual(h.embedded, ["shown"]);
});

test("HDMI viewer rejection rearms the watcher and opens the embedded input", () => {
  const h = harness({ launchFails: "org.tizen.tv-viewer", appControlFails: true });
  h.A.settings.update({ hdmiNativeViewer: true });
  h.A.inputs.show({ type: "HDMI", number: 2 });
  h.requests[0].resolve(200);
  assert.deepEqual(
    h.launches.map(({ method }) => method),
    ["launch", "appcontrol"],
  );
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
  assert.deepEqual(h.embedded, ["shown"]);
});

test("HDMI source selection failure records the Tizen error name and tries the embedded path", () => {
  const h = harness({ sourceFails: true });
  h.A.settings.update({ hdmiNativeViewer: true });
  const source = { type: "HDMI", number: 2 };
  h.A.inputs.show(source);
  h.requests[0].resolve(200);
  assert.deepEqual(h.launches, []);
  assert.deepEqual(h.inputs, [
    { source, target: "MAIN" },
    { source, target: "MAIN" },
  ]);
  const { data } = h.log.snapshot().records.find(({ event }) => event === "handoff.failed");
  assert.equal(data.reason, "source selection failed");
  assert.equal(data.error, "InvalidValuesError");
});

test("HDMI handoff without watcher acknowledgement opens only the embedded input", () => {
  const h = harness();
  h.A.settings.update({ hdmiNativeViewer: true });
  h.A.inputs.show({ type: "HDMI", number: 2 });
  h.requests[0].fail();
  assert.deepEqual(h.launches, []);
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
  assert.deepEqual(h.embedded, ["shown"]);
});

test("an old viewer focus timer cannot rearm the watcher during a newer handoff", () => {
  const h = harness({ visible: true });
  h.A.settings.update({ hdmiNativeViewer: true });
  h.A.inputs.show({ type: "HDMI", number: 2 });
  h.requests[0].resolve(200);
  h.A.inputs.show({ type: "HDMI", number: 3 });
  h.timers.find((timer) => timer.ms === 2100).fn();
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/leave");
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.toasts, []);
});

test("native Live TV fallback rearms when launch accepted but never takes focus", () => {
  const h = harness({ visible: true });
  h.A.inputs.show({ type: "TV", number: 1 });
  h.requests[0].resolve(200);
  assert.equal(h.timers[0].ms, 2100);
  h.timers[0].fn();
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
});

for (const type of ["TV", "HDMI"]) {
  test(`${type} returning Home before the focus timer runs does not report a failed handoff`, () => {
    const h = harness({ visible: true });
    h.A.settings.update({ hdmiNativeViewer: true });
    h.A.inputs.show({ type, number: 1 });
    h.requests[0].resolve(200);
    const focusTimer = h.timers.find((timer) => timer.ms === 2100);
    h.document.hidden = true;
    h.documentListeners.visibilitychange();
    h.document.hidden = false;
    h.documentListeners.visibilitychange();
    // A timer already queued before suspension must also remain harmless.
    focusTimer.fn();
    assert.deepEqual(h.toasts, []);
    assert.equal(h.requests.length, 1, "the focus check must not rearm the watcher after a successful handoff");
    assert.equal(
      h.log.snapshot().records.filter((record) => record.event === "handoff.visibility_unconfirmed").length,
      0,
    );
  });

  test(`${type} hiding before the launch callback also confirms the handoff`, () => {
    const h = harness({ visible: true });
    h.A.settings.update({ hdmiNativeViewer: true });
    h.tz.application.launch = (_id, accepted) => {
      h.document.hidden = true;
      h.documentListeners.visibilitychange();
      accepted();
    };
    h.A.inputs.show({ type, number: 1 });
    h.requests[0].resolve(200);
    h.document.hidden = false;
    h.documentListeners.visibilitychange();
    h.timers.filter((timer) => timer.ms === 2100).forEach((timer) => timer.fn());
    assert.deepEqual(h.toasts, []);
    assert.equal(h.requests.length, 1);
    assert.equal(
      h.log.snapshot().records.filter((record) => record.event === "handoff.visibility_unconfirmed").length,
      0,
    );
  });
}

test("HDMI still reports an accepted launch that never hides the launcher", () => {
  const h = harness({ visible: true });
  h.A.settings.update({ hdmiNativeViewer: true });
  h.A.inputs.show({ type: "HDMI", number: 2 });
  h.requests[0].resolve(200);
  h.timers.find((timer) => timer.ms === 2100).fn();
  assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
  assert.match(h.toasts[0], /Samsung viewer did not open HDMI 2/);
});

test("on page reload native handoff re-arms HomeWatcher", () => {
  const h = harness();
  assert.equal(typeof h.listeners.load, "function");
  h.listeners.load();
  assert.equal(h.requests[0].url, "http://127.0.0.1:47790/home");
});

test("port does not replace the upstream Frame-aware watcher service", () => {
  const html = get("index.html");
  assert.ok(!html.includes('src="js/homewatch.js"'));
  assert.ok(!html.includes('src="js/native-navigation.js"'));
  assert.match(get("src/index.ts"), /createHomeWatcherService/);
  const service = get("src/service/index.ts");
  assert.match(service, /FRAME_HIDDEN_GRACE/);
  assert.match(service, /createArtMode/);
  const source = get("src/platform/tizen/createNativeNavigation.ts");
  assert.doesNotMatch(source, /app_operation_set_current_app|vconf_set_str/);
});

test("launch outcomes correlate with requests and preserve failure handoffs", () => {
  const h = harness();
  h.A.apps.launch({ id: "prime.app", name: "Prime Video" });
  const records = h.log.snapshot().records;
  assert.deepEqual(
    records.map((item) => item.event),
    ["app.launch_requested", "app.launch_accepted"],
  );
  assert.equal(records[1].data.operation_id, records[0].id);
  const failed = harness({ launchFails: "youtube.app" });
  failed.A.apps.launch({ id: "youtube.app", name: "YouTube" });
  failed.requests[0].resolve(200);
  // Deferred error processing must not prevent /home rearm.
  assert.equal(failed.requests[1].url, "http://127.0.0.1:47790/home");
  failed.timers.filter((timer) => timer.ms === 0).forEach((timer) => timer.fn());
  const error = failed.log.snapshot().records.at(-1);
  assert.equal(error.event, "app.launch_failed");
  assert.equal(error.data.error, "Denied");
  assert.equal(error.data.operation_id, failed.log.snapshot().records[0].id);
});

test("Live TV acceptance remains separate from unconfirmed visibility", () => {
  const h = harness({ visible: true });
  h.A.homewatch.openNativeViewer();
  h.requests[0].resolve(200);
  h.timers.find((timer) => timer.ms === 2100).fn();
  assert.deepEqual(
    h.log.snapshot().records.map((item) => item.event),
    ["handoff.request", "handoff.accepted", "handoff.visibility_unconfirmed"],
  );
});

test("app store opens com.samsung.tv.store before the org.volt.apps alias", () => {
  const storeIds = launcherConfig.STORE_APP_IDS;
  assert.deepEqual(storeIds, ["com.samsung.tv.store", "org.volt.apps"]);

  const h = harness({ storeIds });
  h.A.apps.openStore();
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["com.samsung.tv.store"],
    "a successful launch does not also open the alias",
  );
});

test("app store falls back to org.volt.apps where com.samsung.tv.store is missing", () => {
  const h = harness({
    storeIds: ["com.samsung.tv.store", "org.volt.apps"],
    launchFails: "com.samsung.tv.store",
  });
  h.A.apps.openStore();
  assert.deepEqual(
    h.launches.map((r) => r.id),
    ["com.samsung.tv.store", "org.volt.apps"],
  );
  assert.deepEqual(h.toasts, []);
});

test("Native Home closes an embedded HDMI window in the existing launcher", () => {
  const h = harness({ visible: true });
  h.A.inputs.show({ type: "HDMI", number: 1 });
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true);
  h.listeners.appcontrol();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
  assert.deepEqual(h.embedded, ["shown", "hidden"]);
  assert.equal(h.launches.length, 0, "no watcher or foreground relaunch needed");
});

test("non-Home appcontrol leaves HDMI playback untouched", () => {
  const h = harness({ visible: true, operation: "http://tizen.org/appcontrol/operation/view" });
  h.A.inputs.show({ type: "HDMI", number: 1 });
  h.listeners.appcontrol();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true);
  assert.deepEqual(h.embedded, ["shown"]);
});

test("visibility resume closes HDMI only after a real hide transition", () => {
  const h = harness({ visible: true });
  h.A.inputs.show({ type: "HDMI", number: 1 });
  h.documentListeners.visibilitychange();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true, "ordinary HDMI selection stays visible");
  h.document.hidden = true;
  h.documentListeners.visibilitychange();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true);
  h.document.hidden = false;
  h.documentListeners.visibilitychange();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
  assert.deepEqual(h.embedded, ["shown", "hidden"]);
});

test("Home requests while no input is open do not hide the TV window", () => {
  const h = harness({ visible: true });
  h.listeners.appcontrol();
  assert.deepEqual(h.embedded, []);
});

test("HDMI selection refreshes a stale tile and blocks a disconnected port in either viewer", () => {
  for (const native of [false, true]) {
    const h = harness({ visible: true });
    h.A.settings.update({ hdmiNativeViewer: native });
    const stale = { type: "HDMI", number: 1, connected: true };
    h.tz.systeminfo.getPropertyValue = (_name, done) => done({ disconnected: [{ type: "HDMI", number: 1 }] });
    h.A.inputs.show(stale);
    assert.equal(h.A.inputs.getSnapshot().sources[0].connected, false);
    assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
    assert.deepEqual(h.inputs, []);
    assert.deepEqual(h.launches, []);
    assert.deepEqual(h.toasts, ["Could not show HDMI 1"]);
  }
});

test("failed HDMI refresh does not open the cached input", () => {
  const h = harness({ visible: true });
  h.tz.systeminfo.getPropertyValue = (_name, _done, fail) => fail();
  h.A.inputs.show({ type: "HDMI", number: 1, connected: true });
  assert.deepEqual(h.inputs, []);
  assert.deepEqual(h.toasts, ["Could not show HDMI 1"]);
});

test("unplugging the embedded input restores Home", () => {
  const h = harness({ visible: true });
  let connected = true;
  h.tz.systeminfo.getPropertyValue = (_name, done) =>
    done({
      connected: connected ? [{ type: "HDMI", number: 1 }] : [],
      disconnected: connected ? [] : [{ type: "HDMI", number: 1 }],
    });
  h.A.inputs.show({ type: "HDMI", number: 1 });
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true);
  connected = false;
  h.A.inputs.load();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
  assert.deepEqual(h.embedded, ["shown", "hidden"]);
  assert.deepEqual(h.toasts, ["HDMI 1 disconnected"]);
});

for (const stage of ["setSource", "show"]) {
  test(`Back cancels pending ${stage} and late callbacks cannot hide Home`, () => {
    const h = harness({ visible: true });
    let complete;
    h.tz.tvwindow[stage] = (...args) => {
      complete = stage === "setSource" ? args[1] : args[0];
    };
    h.A.inputs.show({ type: "HDMI", number: 1 });
    assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true, "key routing can leave before firmware responds");
    h.A.inputs.leave();
    complete();
    assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
    assert.equal(h.backgrounds.includes("suspended"), false);
    assert.equal(h.timers.filter((timer) => timer.ms === 8000).length, 0);
  });

  test(`a stalled ${stage} restores Home after the input timeout`, () => {
    const h = harness({ visible: true });
    h.tz.tvwindow[stage] = () => {};
    h.A.inputs.show({ type: "HDMI", number: 1 });
    h.timers.find((timer) => timer.ms === 8000).fn();
    assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
    assert.deepEqual(h.embedded, ["hidden"]);
    assert.deepEqual(h.toasts, ["Could not show HDMI 1"]);
  });
}

test("an asynchronous show exception restores Home", () => {
  const h = harness({ visible: true });
  let complete;
  h.tz.tvwindow.setSource = (_source, done) => {
    complete = done;
  };
  h.tz.tvwindow.show = () => {
    throw new Error("Unavailable");
  };
  h.A.inputs.show({ type: "HDMI", number: 1 });
  complete();
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
  assert.deepEqual(h.toasts, ["Could not show HDMI 1"]);
});

test("HDMI uses the fresh native source record instead of the cached tile", () => {
  const h = harness({ visible: true });
  const raw = { type: "HDMI", number: 1, editName: "New PC" };
  h.tz.systeminfo.getPropertyValue = (_name, done) => done({ connected: [raw] });
  h.A.inputs.show({ type: "HDMI", number: 1, editName: "Old PC" });
  assert.equal(h.inputs[0].source, raw);
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", true);
});

test("a delayed HDMI refresh cannot open a video window after the launcher hides", () => {
  const h = harness({ visible: true });
  let complete;
  h.tz.systeminfo.getPropertyValue = (_name, done) => {
    complete = done;
  };
  h.A.inputs.show({ type: "HDMI", number: 1 });
  h.document.hidden = true;
  complete({ connected: [{ type: "HDMI", number: 1 }] });
  assert.deepEqual(h.inputs, []);
  assert.equal(h.A.inputs.getSnapshot().playback !== "idle", false);
});

test("IP Control source selection waits for watcher acknowledgement and precedes native viewer launch", async () => {
  const h = harness({ visible: true });
  let selects = 0;
  let complete;
  h.A.homewatch.openNativeViewer(null, {
    label: "HDMI 5",
    fallback() {
      assert.fail("unexpected fallback");
    },
    selectSource() {
      selects++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  assert.equal(selects, 0);
  assert.equal(h.launches.length, 0);
  h.requests[0].resolve(200);
  assert.equal(selects, 1);
  assert.equal(h.launches.length, 0);
  complete(true);
  await new Promise(setImmediate);
  assert.deepEqual(
    h.launches.map((item) => item.id),
    ["org.tizen.tv-viewer"],
  );
  assert.equal(h.inputs.length, 0);
  h.A.nativeNavigation.dispose();
});

test("IP Control handoff failure rearms the watcher and disposal suppresses late viewer launch", async () => {
  for (const dispose of [false, true]) {
    const h = harness({ visible: true });
    let complete;
    let fallback = 0;
    h.A.homewatch.openNativeViewer(null, {
      label: "HDMI 5",
      fallback() {
        fallback++;
      },
      selectSource: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    });
    h.requests[0].resolve(200);
    if (dispose) h.A.nativeNavigation.dispose();
    complete(dispose);
    await new Promise(setImmediate);
    assert.equal(h.launches.length, 0);
    assert.equal(fallback, Number(!dispose));
    if (!dispose) assert.equal(h.requests[1].url, "http://127.0.0.1:47790/home");
    h.A.nativeNavigation.dispose();
  }
});
