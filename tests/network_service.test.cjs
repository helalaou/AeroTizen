const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createTestSettings } = require("./helpers/settings.cjs");
const { createNetworkService } = loadTypeScript("launcher/src/services/createNetworkService.ts");

const harness = () => {
  const settings = createTestSettings();
  const preferenceListeners = new Set();
  const watches = new Set();
  const intervals = new Map();
  const reads = [];
  let nextTimer = 0;
  const service = createNetworkService({
    settings: {
      getSnapshot: settings.getSnapshot,
      subscribe(listener) {
        preferenceListeners.add(listener);
        const unsubscribe = settings.subscribe(listener);
        return () => {
          preferenceListeners.delete(listener);
          unsubscribe();
        };
      },
    },
    platform: {
      read(done) {
        const request = { done, cancelled: false };
        reads.push(request);
        return () => {
          request.cancelled = true;
        };
      },
      subscribe(listener) {
        watches.add(listener);
        return () => watches.delete(listener);
      },
    },
    timers: {
      setInterval(callback, delay) {
        const id = nextTimer++;
        intervals.set(id, { callback, delay });
        return id;
      },
      clearInterval(id) {
        intervals.delete(id);
      },
    },
  });
  return { service, settings, watches, preferenceListeners, intervals, reads };
};

test("consumers share one native watch and poller; reads and subscriptions perform no hardware work", () => {
  const h = harness();
  h.service.subscribe(() => {});
  h.service.subscribe(() => {});
  const initial = h.service.getSnapshot();
  assert.equal(h.service.getSnapshot(), initial);
  assert.equal(h.reads.length, 0);
  assert.equal(h.watches.size, 0);
  assert.equal(h.intervals.size, 0);
  h.service.start();
  h.service.start();
  h.service.subscribe(() => {});
  assert.equal(h.reads.length, 1);
  assert.equal(h.watches.size, 1);
  assert.equal(h.intervals.size, 1);
  assert.equal(h.intervals.get(0).delay, 60_000);
  h.intervals.get(0).callback();
  assert.equal(h.reads.length, 2);
  assert.equal(h.reads[0].cancelled, true);
  h.service.dispose();
});

test("unchanged polling and unrelated preferences retain snapshot identity and do not notify views", () => {
  const h = harness();
  let updates = 0;
  h.service.subscribe(() => updates++);
  h.service.start();
  h.reads[0].done({ kind: "wifi", strength: 0.5 });
  const wifi = h.service.getSnapshot();
  assert.equal(updates, 1);
  assert.equal(Object.isFrozen(wifi), true);
  h.intervals.get(0).callback();
  h.reads[1].done({ kind: "wifi", strength: 0.5 });
  h.settings.update({ background: "black", language: "de" });
  assert.equal(h.service.getSnapshot(), wifi);
  assert.equal(updates, 1);
  const reads = h.reads.length;
  h.settings.update({ showNetwork: false });
  assert.equal(h.service.getSnapshot().visible, false);
  assert.equal(h.service.getSnapshot().kind, "wifi");
  assert.equal(h.service.getSnapshot().strength, 0.5);
  assert.equal(updates, 2);
  assert.equal(h.reads.length, reads, "visibility changes need no hardware query");
  h.service.dispose();
});

test("superseded readings cannot overwrite a newer result", () => {
  const h = harness();
  h.service.start();
  h.service.refresh();
  h.reads[1].done({ kind: "ethernet", strength: null });
  const ethernet = h.service.getSnapshot();
  h.reads[0].done({ kind: "wifi", strength: 0.1 });
  assert.equal(h.service.getSnapshot(), ethernet);
  h.service.dispose();
});

test("disposal releases timer zero, platform watches, settings and consumers; late callbacks are inert", () => {
  const h = harness();
  let updates = 0;
  h.service.subscribe(() => updates++);
  h.service.start();
  const latePreference = [...h.preferenceListeners][0];
  const lateWatch = [...h.watches][0];
  const lateTimer = h.intervals.get(0).callback;
  h.service.dispose();
  h.service.dispose();
  assert.equal(h.reads[0].cancelled, true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.watches.size, 0);
  assert.equal(h.preferenceListeners.size, 0);
  const state = h.service.getSnapshot();
  h.settings.update({ showNetwork: false });
  latePreference();
  lateWatch();
  lateTimer();
  h.reads[0].done({ kind: "ethernet", strength: null });
  h.service.start();
  h.service.refresh();
  assert.equal(h.service.getSnapshot(), state);
  assert.equal(h.reads.length, 1);
  assert.equal(updates, 0);
});

test("disposing during a synchronous result cancels its returned handle", () => {
  const settings = createTestSettings();
  let cancelled = 0;
  const service = createNetworkService({
    settings,
    platform: {
      read(done) {
        done({ kind: "ethernet", strength: null });
        return () => cancelled++;
      },
      subscribe: () => () => {},
    },
    timers: { setInterval: () => 0, clearInterval() {} },
  });
  service.subscribe(() => service.dispose());
  service.start();
  assert.equal(cancelled, 1);
});
