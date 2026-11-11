"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");

const { createDiagnosticsPrivacy } = loadTypeScript("launcher/src/diagnostics/createDiagnosticsPrivacy.ts");
const { createDiagnosticsContext } = loadTypeScript("launcher/src/diagnostics/service/createDiagnosticsContext.ts");
const { openDiagnosticsStore } = loadTypeScript("launcher/src/diagnostics/service/openDiagnosticsStore.ts");
const fixedNow = 12345;
const control = { mode: "watcher", persistent: true, protocol: 1 };
const state = { heartbeats: 7, guard: { launchCalls: 2 } };
const normalise = (value) => JSON.parse(JSON.stringify(value).replace(/d-[a-f0-9]{8}-/g, "d-session-"));

function frozen(name, imports) {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve("./fixtures/diagnostics/service/" + name), "utf8"), {
    module,
    Buffer,
    process: { arch: "arm" },
    Date: class extends Date {
      static now() {
        return fixedNow;
      }
    },
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), name);
      return imports[name];
    },
  });
  return module.exports;
}

const packets = [
  null,
  [],
  "invalid",
  {},
  {
    version: "2.4.0",
    build: { version: "2.4.0", build_id: "a".repeat(64), commit: "b".repeat(40), dirty: false, secret: "PRIVATE" },
    health: {
      buffered: 200,
      discarded: 0,
      invalid: 1,
      pending_errors: 0,
      writes: 3,
      write_failures: 0,
      read_failures: 0,
      saving: false,
      unsaved: true,
      storage: "saving",
      clock: "monotonic",
      session: "private-session",
      secret: "PRIVATE",
    },
    delivery: { state: "acknowledged", retries: 3, last_status: 599 },
    queued: 0,
    secret: "PRIVATE",
  },
  {
    version: "PRIVATE",
    build: { version: "bad", build_id: "a".repeat(65), commit: "b".repeat(39), dirty: "true" },
    health: { buffered: Infinity, discarded: -1, writes: "2", saving: 1, session: "not a session", storage: "bad" },
    delivery: { state: "bad", retries: 4, last_status: 99 },
    queued: NaN,
  },
  { build: [], health: [], delivery: { retries: -1, last_status: 600 }, queued: Infinity },
  { build: true, health: true, delivery: "invalid", queued: -1 },
  {
    health: { session: "a".repeat(65), clock: "wall_fallback", saving: true },
    delivery: { retries: 0, last_status: 100 },
  },
];

test("typed context matches frozen metadata filtering and cached collection", () => {
  const environments = [
    [null, 'VERSION_ID="9.0.0"\nBUILD_ID="T-TEST-0090"\nSECRET=PRIVATE'],
    [null, "VERSION_ID='5.5.0'"],
    [null, "VERSION_ID=9.0.0\nVERSION_ID=8.0.0\nBUILD_ID=T-TEST-0080"],
    [null, "x".repeat(16384) + "\nVERSION_ID=9.0.0\nBUILD_ID=T-TEST-0090"],
    [new Error("unavailable"), undefined],
  ];
  for (const packet of packets) {
    for (const [error, text] of environments) {
      const build = packet?.build;
      const run = (legacy) => {
        let finish;
        let reads = 0;
        const options = {
          privacy: createDiagnosticsPrivacy(),
          read: (done) => {
            reads++;
            finish = done;
          },
        };
        const context = legacy
          ? frozen("diagnostics-context", { fs: {}, "../js/build-info": build })(options)
          : createDiagnosticsContext({ ...options, build, arch: "arm", now: () => fixedNow });
        context.accept({ health: { buffered: 2 }, queued: 2 });
        context.accept(packet);
        const before = normalise(context.enrich({ records: [] }, control, state));
        context.start();
        context.start();
        assert.equal(reads, 1);
        finish(error, text);
        const after = normalise(context.enrich({ records: [] }, control, state));
        return { before, after };
      };
      assert.deepEqual(run(false), run(true));
    }
  }
});

test("context enrichment leaves caller snapshots and watcher inputs unchanged", () => {
  const snapshot = Object.freeze({ records: Object.freeze([]) });
  const context = createDiagnosticsContext({
    arch: null,
    privacy: createDiagnosticsPrivacy(),
    read: (done) => done(null, ""),
  });
  const enriched = context.enrich(snapshot, Object.freeze(control), Object.freeze(state));
  assert.notEqual(enriched, snapshot);
  assert.equal(enriched.records, snapshot.records);
  assert.deepEqual(Object.keys(snapshot), ["records"]);
});

function storageTrace(legacy, scenario) {
  const trace = [];
  const payload = scenario.payload ?? "[]";
  const failure = (name) => (scenario.failure === name ? new Error(name + " failed") : null);
  const fs = {
    stat: (path, done) => {
      trace.push(["stat", path]);
      done(failure("stat"), { size: scenario.size ?? Buffer.byteLength(payload, "utf8") });
    },
    readFile: (path, encoding, done) => {
      trace.push(["read", path, encoding]);
      done(failure("read"), payload);
    },
    writeFile: (path, value, options, done) => {
      trace.push(["write", path, Buffer.byteLength(value, "utf8"), options.encoding, options.mode]);
      done(failure("write"));
    },
    rename: (from, to, done) => {
      trace.push(["rename", from, to]);
      done(failure("rename"));
    },
    unlink: (path, done) => {
      trace.push(["unlink", path]);
      done(scenario.cleanupFailure ? new Error("cleanup failed") : null);
    },
  };
  const host = scenario.absent
    ? null
    : {
        filesystem: {
          resolve: (path, done, failed, mode) => {
            trace.push(["resolve", path, mode]);
            if (scenario.failure === "resolve") {
              failed();
            } else if (scenario.failure === "throw") {
              throw new Error("resolve threw");
            } else {
              done({ toURI: () => scenario.uri ?? "file:///virtual/private%20space/" });
            }
          },
        },
      };
  const open = legacy ? frozen("diagnostics-store", { fs }) : openDiagnosticsStore;
  open(
    host,
    (store) => {
      trace.push(["ready", !!store]);
      if (store) {
        store.load((error, value) => trace.push(["loaded", error?.message ?? null, value?.length ?? null]));
        store.save(payload, (error) => trace.push(["saved", error?.message ?? null]));
      }
    },
    { fs, byteLength: (value) => Buffer.byteLength(value, "utf8") },
  );
  return trace;
}

for (const [name, scenario] of Object.entries({
  success: {},
  absent: { absent: true },
  denied: { failure: "resolve" },
  thrown: { failure: "throw" },
  relative: { uri: "file://relative/private" },
  malformed: { uri: "file:///invalid%URI" },
  missing: { failure: "stat" },
  unreadable: { failure: "read" },
  unwritable: { failure: "write" },
  rename: { failure: "rename" },
  cleanup: { failure: "rename", cleanupFailure: true },
  boundary: { payload: "x".repeat(256 * 1024) },
  oversized: { payload: "x".repeat(256 * 1024 + 1) },
  multibyte: { size: 0, payload: "😀".repeat(65537) },
})) {
  test(`typed service storage matches frozen I/O and limits: ${name}`, () => {
    assert.deepEqual(storageTrace(false, scenario), storageTrace(true, scenario));
  });
}
