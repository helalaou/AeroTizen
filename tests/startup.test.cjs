const { installApps } = require("./helpers/apps.cjs");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createTestSettings } = require("./helpers/settings.cjs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const test = require("node:test");
const { startLauncherBoot } = loadTypeScript("launcher/src/app/startLauncherBoot.ts");
const { createStartupTracing } = loadTypeScript("launcher/src/diagnostics/createStartupTracing.ts");
const { launcherConfig } = loadTypeScript("launcher/src/launcherConfig.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness(mode = "deferred", saved = ["youtube.id"]) {
  const timers = new Map(),
    frames = [],
    calls = [],
    data = {},
    events = {},
    listeners = new Map();
  let timerId = 0;
  let reply, reject;
  const eventTarget = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) {
        listeners.set(name, new Set());
        events[name] = () => listeners.get(name).forEach((listener) => listener());
      }
      listeners.get(name).add(fn);
    },
    removeEventListener: (name, fn) => listeners.get(name).delete(fn),
  };
  const document = { hidden: false, ...eventTarget };
  const setTimeout = (callback, delay = 0) => {
    const id = timerId++;
    timers.set(id, { callback, delay });
    return id;
  };
  const clearTimeout = (id) => timers.delete(id);
  const runTimers = (delay) => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay === delay && timers.delete(id)) timer.callback();
    }
  };
  const A = {
    config: launcherConfig,
    applyBackground() {},
    tizen: {
      application: {
        getAppsInfo(done, fail) {
          calls.push("discover");
          reply = done;
          reject = fail;
          if (mode === "throw") throw new Error("not ready");
          if (mode === "fail") fail();
        },
      },
    },
    catalog: { preloadedStoreId: () => null },
    settings: createTestSettings(
      { home: saved },
      {
        storage: { getItem: () => null, setItem: () => calls.push("save") },
      },
    ),
    continueWatching: { start() {} },
    clock: { start() {}, tick: () => calls.push("clock-tick") },
    network: { start() {} },
    weather: { start() {} },
    inputs: { start() {} },
    settingsUi: { isOpen: () => false },
    homewatch: { start() {}, reportApps() {}, reportStartup() {} },
    homeScreen: {
      render() {
        calls.push("render");
      },
      refreshApps() {
        calls.push("refresh");
      },
    },
  };
  const localStorage = {
    getItem: (key) => data[key] || null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
  const window = {
    AeroTizen: A,
    tizen: A.tizen,
    document,
    localStorage,
    ...eventTarget,
    setTimeout,
    clearTimeout,
    performance: { timing: { navigationStart: Date.now() - 10 } },
    requestAnimationFrame: (cb) => frames.push(cb) - 1,
    cancelAnimationFrame: (id) => {
      frames[id] = undefined;
    },
  };
  const context = vm.createContext({
    window,
    AeroTizen: A,
    document,
    localStorage,
    setTimeout,
    clearTimeout,
  });
  window.AeroStartup = createStartupTracing(window);
  installApps(context);
  return {
    A,
    calls,
    data,
    events,
    document,
    runTimers,
    reply: (list) => reply(list),
    fail: () => reject(),
    discover() {
      events.load();
      frames.shift()();
      frames.shift()();
      runTimers(0);
    },
    boot() {
      return startLauncherBoot(window, A, window.AeroStartup);
    },
  };
}

for (const mode of ["deferred", "throw", "fail"])
  test("Home renders before " + mode + " package discovery and keeps favourites", () => {
    const h = harness(mode);
    h.boot();
    assert.deepEqual(h.calls, ["render"]);
    h.discover();
    assert.equal(h.calls[0], "render");
    assert.equal(h.calls[1], "discover");
    assert.deepEqual(h.A.settings.getSnapshot().home, ["youtube.id"]);
    assert.equal(h.A.apps.byId("youtube.id").id, "youtube.id");
    assert.equal(h.A.apps.getSnapshot().ready, false);
  });

test("late discovery refreshes once and caches labels without resetting saved Home", () => {
  const h = harness();
  h.boot();
  h.discover();
  const list = [
    {
      id: "youtube.id",
      name: "YouTube",
      show: true,
      packageId: "abcdefghij",
      iconPath: "icon.png",
    },
  ];
  h.reply(list);
  h.reply(list);
  h.fail();
  assert.equal(h.calls.filter((x) => x === "refresh").length, 1);
  assert.deepEqual(h.A.settings.getSnapshot().home, ["youtube.id"]);
  assert.equal(h.A.apps.getSnapshot().ready, true);
  const cached = JSON.parse(h.data["aerotizen.apps.v1"]);
  assert.equal(cached[0].name, "YouTube");
});

test("missing cache and never-returning discovery do not save first-run defaults early", () => {
  const h = harness("deferred", null);
  h.boot();
  h.discover();
  assert.equal(h.A.settings.getSnapshot().homeInitialized, false);
  assert.equal(h.calls.includes("save"), false);
});

test("app-control and visibility coalesce discovery on return and boot disposal cancels a pending refresh", () => {
  const h = harness("fail");
  const dispose = h.boot();
  h.events.appcontrol();
  assert.deepEqual(h.calls, ["render"]);
  h.discover();
  h.document.hidden = true;
  h.events.visibilitychange();
  h.events.appcontrol();
  h.runTimers(0);
  assert.deepEqual(h.calls, ["render", "discover"]);
  h.document.hidden = false;
  h.events.appcontrol();
  h.events.visibilitychange();
  h.runTimers(0);
  assert.deepEqual(h.calls, ["render", "discover", "clock-tick", "discover"]);

  h.events.appcontrol();
  dispose();
  h.events.visibilitychange();
  h.runTimers(0);
  assert.deepEqual(h.calls, ["render", "discover", "clock-tick", "discover"]);
});

test("valid cached labels remain available if discovery fails; malformed cache is ignored", () => {
  const h = harness("fail");
  h.data["aerotizen.apps.v1"] = JSON.stringify([{ id: "youtube.id", name: "YouTube", icon: "" }, null]);
  h.boot();
  h.discover();
  assert.equal(h.A.apps.byId("youtube.id").name, "YouTube");
  assert.deepEqual(plain(h.A.settings.getSnapshot().home), ["youtube.id"]);
  const bad = harness();
  bad.data["aerotizen.apps.v1"] = "{";
  bad.boot();
  assert.equal(bad.A.apps.byId("youtube.id").name, "youtube.id");
});

test("startup records routing flags and focus without keeping private launch payloads", () => {
  const h = harness();
  let focused = false;
  let control = {
    operation: "http://tizen.org/appcontrol/operation/main",
    data: [
      { key: "entry_point", value: ["cold_booting"] },
      { key: "__K_BG_LAUNCH", value: ["enable"] },
      { key: "PAYLOAD", value: ["private title and token"] },
    ],
  };
  h.document.hasFocus = () => focused;
  h.A.tizen.application.getCurrentApplication = () => ({
    getRequestedAppControl: () => ({ appControl: control }),
  });
  h.boot();
  h.discover();
  let trace = JSON.parse(h.data["aerotizen.startup.v1"]);
  assert.deepEqual(trace.launch.data, { entry_point: "cold_booting", __K_BG_LAUNCH: "enable" });
  assert.equal(trace.marks.at(-1).focused, false);
  assert.equal(JSON.stringify(trace).includes("private title"), false);
  focused = true;
  h.events.focus();
  control = { operation: "main", data: [{ key: "entry_point", value: ["smarthub_key"] }] };
  h.events.appcontrol();
  trace = JSON.parse(h.data["aerotizen.startup.v1"]);
  assert.equal(trace.launch.data.entry_point, "cold_booting");
  assert.equal(trace.last_launch.data.entry_point, "smarthub_key");
  assert.equal(trace.marks.at(-1).name, "appcontrol");
  assert.equal(trace.marks.at(-1).focused, true);
});

test("diagnostics stay bounded and tolerate unavailable launch APIs", () => {
  const h = harness();
  h.document.hasFocus = () => false;
  h.A.tizen.application.getCurrentApplication = () => {
    throw Object.assign(new Error("private data"), { name: "SecurityError" });
  };
  h.boot();
  h.discover();
  for (let i = 0; i < 100; i++) {
    h.events.appcontrol();
    h.events.blur();
  }
  let trace = JSON.parse(h.data["aerotizen.startup.v1"]);
  assert.equal(trace.marks.length, 32);
  assert.equal(trace.launch.error, "SecurityError");
  assert.equal(JSON.stringify(trace).includes("private data"), false);
  h.A.tizen.application.getCurrentApplication = () => ({
    getRequestedAppControl: () => ({
      appControl: {
        operation: "x".repeat(1000),
        data: ["entry_point", "__K_BG_LAUNCH", "init", "SkipReload"].map((key) => ({
          key,
          value: ["x".repeat(1000)],
        })),
      },
    }),
  });
  h.events.appcontrol();
  trace = JSON.parse(h.data["aerotizen.startup.v1"]);
  assert.equal(trace.last_launch.operation.length, 96);
  assert.equal(trace.last_launch.data.entry_point.length, 48);
  assert.ok(JSON.stringify(trace).length <= 4096);
});
