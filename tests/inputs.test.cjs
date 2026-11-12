const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createTestSettings } = require("./helpers/settings.cjs");
const { translateEnglish } = require("./helpers/translate_english.cjs");
const { createInputsService } = loadTypeScript("launcher/src/services/createInputsService.ts");
const { createInputsPlatform } = loadTypeScript("launcher/src/platform/tizen/createInputsPlatform.ts");

function harness(preferences = {}, ipControl) {
  const events = new Map();
  const visibility = new Set();
  const watches = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const pending = [];
  const native = [];
  const toasts = [];
  let nextId = 0;
  const state = {
    report: { connected: [{ type: "HDMI", number: 1, editName: "PC" }], disconnected: [] },
    selected: { type: "HDMI", number: 1 },
    hidden: false,
    deferred: false,
    reads: 0,
    operation: "main",
  };
  const settings = createTestSettings({ hideDisconnectedHdmi: true, showLiveTv: true, ...preferences });
  const host = {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
    document: {
      get hidden() {
        return state.hidden;
      },
      addEventListener: (_, fn) => visibility.add(fn),
      removeEventListener: (_, fn) => visibility.delete(fn),
    },
    AeroTizen: {
      homewatch: {},
      tizen: {
        application: {
          getCurrentApplication: () => ({
            getRequestedAppControl: () => ({
              appControl: { operation: "http://tizen.org/appcontrol/operation/" + state.operation },
            }),
          }),
        },
        systeminfo: {
          getPropertyValue(_, done) {
            state.reads++;
            if (state.deferred) pending.push(done);
            else done(state.report);
          },
          addPropertyValueChangeListener(_, fn) {
            const id = ++nextId;
            watches.set(id, fn);
            return id;
          },
          removePropertyValueChangeListener: (id) => watches.delete(id),
        },
        tvwindow: {
          getSource: () => state.selected,
          setSource: (source, done) => {
            native.push(source);
            done();
          },
          show: (done) => {
            native.push("show");
            done();
          },
          hide: () => native.push("hide"),
        },
      },
    },
  };
  const service = createInputsService({
    platform: { ...createInputsPlatform(host), ipControl },
    settings,
    timers: {
      setInterval: (fn) => {
        const id = ++nextId;
        intervals.set(id, fn);
        return id;
      },
      clearInterval: (id) => intervals.delete(id),
      setTimeout: (fn) => {
        const id = ++nextId;
        timeouts.set(id, fn);
        return id;
      },
      clearTimeout: (id) => timeouts.delete(id),
    },
    translate: translateEnglish,
    toast: (message) => toasts.push(message),
  });
  return { service, settings, host, state, pending, native, toasts, events, visibility, watches, intervals, timeouts };
}

test("inputs publish immutable view data, retain unchanged records and keep native objects private", () => {
  const h = harness();
  h.service.load();
  const before = h.service.getSnapshot();
  let updates = 0;
  h.service.subscribe(() => updates++);
  h.service.load();
  assert.equal(h.service.getSnapshot(), before);
  assert.equal(updates, 0);
  assert.ok([before, before.sources, before.visibleSources, before.sources[0]].every(Object.isFrozen));
  assert.equal("raw" in before.sources[0], false);
  assert.equal("sources" in h.service, false);
  assert.equal("watching" in h.service, false);
  assert.equal("refresh" in h.service, false);
  h.state.report.connected.push({ type: "HDMI", number: 2 });
  h.service.load();
  assert.equal(h.service.getSnapshot().sources[0], before.sources[0]);
  assert.equal(before.sources.length, 1);
  assert.equal(updates, 1);
});

test("discovery deduplicates connected sources, retains standby labels, sorts TV last and passes the fresh native record", () => {
  const h = harness();
  const raw = { type: "HDMI", number: 1, editName: "HDMI 1" };
  h.state.report = {
    connected: [{ type: "TV", number: 1 }, raw],
    disconnected: [
      { type: "HDMI", number: 1, editName: "PlayStation 5" },
      { type: "HDMI", number: 2, signal: true },
      { type: "MEDIA", number: 1 },
    ],
  };
  h.service.load();
  const sources = h.service.getSnapshot().sources;
  assert.deepEqual(
    sources.map(({ type, number }) => type + number),
    ["HDMI1", "HDMI2", "TV1"],
  );
  assert.equal(sources[0].editName, "PlayStation 5");
  assert.equal(sources[0].active, true);
  assert.equal(sources[1].connected, true);
  assert.equal(raw.editName, "HDMI 1", "the adapter must not change the TV-owned object");
  h.service.show(sources[0]);
  assert.equal(h.native[0], raw);
  raw.editName = "Changed externally";
  assert.equal(sources[0].editName, "PlayStation 5");
});

test("source visibility and labels react to saved preferences without manual UI refresh or device reads", () => {
  const h = harness();
  h.state.report = {
    connected: [{ type: "TV", number: 1 }],
    disconnected: [
      { type: "HDMI", number: 1, editName: "HDMI 1" },
      { type: "HDMI", number: 2, editName: "Xbox" },
    ],
  };
  h.service.load();
  const before = h.service.getSnapshot();
  assert.equal(before.visibleSources.length, 2);
  h.settings.update({ showLiveTv: false, hdmiKeepVisible: { 1: true }, inputNames: { "HDMI 1": "Console" } });
  const after = h.service.getSnapshot();
  assert.equal(after.sources, before.sources);
  assert.deepEqual(
    after.visibleSources.map((source) => source.type + source.number),
    ["HDMI1", "HDMI2"],
  );
  assert.equal(h.service.label(after.sources[0]), "Console");
  assert.equal(h.service.hasRecognizedDevice(after.sources[0]), false, "custom labels must not invent a device");
  assert.equal(h.state.reads, 1);
  h.settings.update({ hdmiKeepVisible: {}, hideDisconnectedHdmi: false });
  assert.equal(h.service.getSnapshot().visibleSources.length, 2);
});

test("malformed and superseded reads retain the last good snapshot without publishing stale active states", () => {
  const h = harness();
  h.service.load();
  const before = h.service.getSnapshot();
  h.state.deferred = true;
  let updates = 0;
  h.service.subscribe(() => updates++);
  h.service.load();
  h.pending[0]({ connected: "invalid" });
  assert.equal(h.service.getSnapshot(), before);
  h.service.load();
  h.service.load();
  h.pending[2]({ disconnected: [{ type: "HDMI", number: 1 }] });
  h.pending[1]({ connected: [{ type: "HDMI", number: 1 }] });
  assert.equal(h.service.getSnapshot().sources[0].active, false);
  assert.equal(h.service.getSnapshot().sources[0].connected, false);
  assert.equal(updates, 1);
});

test("start owns one foreground poller, native watch and visibility/Home listeners; disposal removes them", () => {
  const h = harness();
  h.service.start();
  h.service.start();
  assert.equal(h.intervals.size, 1);
  assert.equal(h.watches.size, 1);
  assert.equal(h.visibility.size, 1);
  assert.equal(h.events.size, 1);
  assert.equal(h.state.reads, 1);
  h.state.hidden = true;
  [...h.intervals.values()][0]();
  assert.equal(h.state.reads, 1);
  h.state.hidden = false;
  [...h.visibility][0]();
  assert.equal(h.state.reads, 2);
  const changed = [...h.watches.values()][0];
  h.service.dispose();
  h.service.dispose();
  changed();
  h.service.start();
  h.service.load();
  assert.equal(h.state.reads, 2);
  assert.equal(h.intervals.size + h.watches.size + h.visibility.size + h.events.size, 0);
});

test("an unplug during embedded playback clears active state and restores idle playback", () => {
  const h = harness();
  h.service.show({ type: "HDMI", number: 1 });
  assert.equal(h.service.getSnapshot().playback, "playing");
  h.state.report = { disconnected: [{ type: "HDMI", number: 1 }] };
  h.service.load();
  assert.equal(h.service.getSnapshot().playback, "idle");
  assert.equal(h.native.at(-1), "hide");
  assert.deepEqual(h.toasts, ["PC disconnected"]);
  h.service.load();
  assert.deepEqual(h.toasts, ["PC disconnected"], "repeat discovery does not repeat the disconnect notice");
});

for (const stage of ["setSource", "show"]) {
  test(`pending ${stage} is cancellable and late callbacks cannot reopen video after disposal`, () => {
    const h = harness();
    let complete;
    h.host.AeroTizen.tizen.tvwindow[stage] = (...args) => {
      complete = stage === "setSource" ? args[1] : args[0];
    };
    h.service.show({ type: "HDMI", number: 1 });
    assert.equal(h.service.getSnapshot().playback, "opening");
    h.service.dispose();
    const before = h.service.getSnapshot();
    complete();
    assert.equal(h.service.getSnapshot(), before);
    assert.equal(before.playback, "idle");
    assert.equal(h.timeouts.size, 0);
    assert.equal(h.native.includes("show"), false);
  });
}

test("Home return closes only active playback and ordinary appcontrol requests leave it running", () => {
  const h = harness();
  h.service.start();
  h.events.get("appcontrol")();
  assert.deepEqual(h.native, []);
  h.service.show({ type: "HDMI", number: 1 });
  h.state.operation = "view";
  h.events.get("appcontrol")();
  assert.equal(h.service.getSnapshot().playback, "playing");
  h.state.hidden = true;
  [...h.visibility][0]();
  h.state.hidden = false;
  [...h.visibility][0]();
  assert.equal(h.service.getSnapshot().playback, "idle");
});

test("learned input ports survive refreshes, stay visible, and defer to native records", async () => {
  const h = harness({}, { request: async () => ({ status: "listed", ports: [5, 5, -1] }), dispose() {} });
  h.service.start();
  await new Promise(setImmediate);
  const learned = h.service.getSnapshot().sources.find((source) => source.number === 5);
  assert.equal(learned.ipControl, true);
  assert.equal(h.service.isVisible(learned), true);
  assert.ok(Object.isFrozen(learned));
  h.service.load();
  assert.equal(
    h.service.getSnapshot().sources.find((source) => source.number === 5),
    learned,
  );
  h.state.report.connected.push({ type: "HDMI", number: 5 });
  h.service.load();
  assert.equal(h.service.getSnapshot().sources.filter((source) => source.number === 5).length, 1);
  assert.equal(h.service.getSnapshot().sources.find((source) => source.number === 5).ipControl, undefined);
  h.state.report.connected.pop();
  h.service.load();
  assert.equal(h.service.getSnapshot().sources.find((source) => source.number === 5).ipControl, true);
  h.service.dispose();
});

test("learning uses the current native snapshot and cannot be overwritten by an older restore", async () => {
  let restore;
  let learns = 0;
  const h = harness(
    {},
    {
      request(command) {
        if (command.action === "list")
          return new Promise((resolve) => {
            restore = resolve;
          });
        assert.deepEqual(command, { action: "learn", nativePorts: [1] });
        learns++;
        return Promise.resolve({ status: "added", port: 5, ports: [5] });
      },
      dispose() {},
    },
  );
  assert.deepEqual(await h.service.learnIpControlInput(), { status: "scanFailed" });
  h.service.start();
  const first = h.service.learnIpControlInput();
  assert.equal(h.service.learnIpControlInput(), first);
  assert.deepEqual(await first, { status: "added", port: 5 });
  restore({ status: "listed", ports: [] });
  await new Promise(setImmediate);
  assert.equal(learns, 1);
  assert.equal(
    h.service.getSnapshot().sources.some((source) => source.ipControl),
    true,
  );
  h.service.dispose();
});

test("learned input selection uses IP Control without the native connected-port gate or embedded fallback", async () => {
  const commands = [];
  let disposed = 0;
  const h = harness(
    {},
    {
      request: async (command) => {
        commands.push(command);
        return command.action === "list" ? { status: "listed", ports: [5] } : { status: "switched" };
      },
      dispose() {
        disposed++;
      },
    },
  );
  let handoff;
  h.host.AeroTizen.homewatch.openNativeViewer = (_, value) => {
    handoff = value;
    return true;
  };
  h.service.start();
  await new Promise(setImmediate);
  const reads = h.state.reads;
  h.service.show(h.service.getSnapshot().sources.find((source) => source.number === 5));
  assert.equal(h.state.reads, reads);
  assert.equal(await handoff.selectSource(), true);
  assert.deepEqual(commands.at(-1), { action: "switch", port: 5 });
  handoff.fallback();
  assert.equal(h.native.length, 0);
  assert.deepEqual(h.toasts, ["Could not switch input"]);
  h.service.dispose();
  assert.equal(disposed, 1);
});

test("disposal rejects late learned-port replies and stops restore retries", async () => {
  let reply;
  const h = harness(
    {},
    {
      request: () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
      dispose() {},
    },
  );
  h.service.start();
  const snapshot = h.service.getSnapshot();
  h.service.dispose();
  reply({ status: "listed", ports: [5] });
  await new Promise(setImmediate);
  assert.equal(h.service.getSnapshot(), snapshot);
  assert.equal(h.timeouts.size, 0);
});
