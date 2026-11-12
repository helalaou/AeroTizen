"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");

const { createDiagnosticsPrivacy } = loadTypeScript("launcher/src/diagnostics/createDiagnosticsPrivacy.ts");
const { createDiagnosticsContext } = loadTypeScript("launcher/src/diagnostics/service/createDiagnosticsContext.ts");
const { openDiagnosticsStore } = loadTypeScript("launcher/src/diagnostics/service/openDiagnosticsStore.ts");
const fixedNow = 12345;
const control = { mode: "watcher", persistent: true, protocol: 1 };
const state = { heartbeats: 7, guard: { launchCalls: 2 } };
const normalise = (value) => JSON.parse(JSON.stringify(value).replace(/d-[a-f0-9]{8}-/g, "d-session-"));
const emptyBuild = { version: null, build_id: null, commit: null, dirty: null };
const emptyDelivery = { state: null, retries: null, last_status: null };
const emptyUi = {
  reported_at: fixedNow,
  health: {},
  build: emptyBuild,
  delivery: emptyDelivery,
  version: null,
  queued: null,
};
const validBuild = { version: "2.4.0", build_id: "a".repeat(64), commit: "b".repeat(40), dirty: false };
const initialUi = { ...emptyUi, health: { buffered: 2 }, queued: 2 };
const initialEnvironment = { state: "loading", tizen: null, firmware: null, arch: "arm" };
const expectedContext = {
  mode: "watcher",
  persistent: true,
  protocol: 1,
  watcher_heartbeats: 7,
  watcher_launch_calls: 2,
  native_settings: "not_queried",
};

const packets = [
  { name: "null preserves the previous UI report", packet: null, expected: initialUi },
  { name: "arrays preserve the previous UI report", packet: [], expected: initialUi },
  { name: "strings cannot supply metadata", packet: "invalid", expected: emptyUi },
  { name: "missing metadata fields are empty", packet: {}, expected: emptyUi },
  {
    name: "valid fields survive and private fields are omitted",
    packet: {
      version: "2.4.0",
      build: { ...validBuild, secret: "PRIVATE" },
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
    expected: {
      reported_at: fixedNow,
      build: validBuild,
      version: "2.4.0",
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
        session: "d-session-1",
      },
      delivery: { state: "acknowledged", retries: 3, last_status: 599 },
      queued: 0,
    },
  },
  {
    name: "malformed formats, counters and enums are rejected",
    packet: {
      version: "PRIVATE",
      build: { version: "bad", build_id: "a".repeat(65), commit: "b".repeat(39), dirty: "true" },
      health: { buffered: Infinity, discarded: -1, writes: "2", saving: 1, session: "not a session", storage: "bad" },
      delivery: { state: "bad", retries: 4, last_status: 99 },
      queued: NaN,
    },
    expected: emptyUi,
  },
  {
    name: "array fields and out-of-range delivery values are rejected",
    packet: { build: [], health: [], delivery: { retries: -1, last_status: 600 }, queued: Infinity },
    expected: emptyUi,
  },
  {
    name: "scalar fields and negative queue counts are rejected",
    packet: { build: true, health: true, delivery: "invalid", queued: -1 },
    expected: emptyUi,
  },
  {
    name: "minimum delivery values and fallback clock survive an oversized session",
    packet: {
      health: { session: "a".repeat(65), clock: "wall_fallback", saving: true },
      delivery: { retries: 0, last_status: 100 },
    },
    expected: {
      ...emptyUi,
      health: { clock: "wall_fallback", saving: true },
      delivery: { state: null, retries: 0, last_status: 100 },
    },
  },
];
const environments = [
  {
    name: "complete",
    text: 'VERSION_ID="9.0.0"\nBUILD_ID="T-TEST-0090"\nSECRET=PRIVATE',
    expected: { arch: "arm", state: "collected", tizen: "9.0.0", firmware: "T-TEST-0090" },
  },
  {
    name: "missing firmware",
    text: "VERSION_ID='5.5.0'",
    expected: { arch: "arm", state: "partial", tizen: "5.5.0", firmware: null, reason: "os_release_fields_missing" },
  },
  {
    name: "last duplicate field wins",
    text: "VERSION_ID=9.0.0\nVERSION_ID=8.0.0\nBUILD_ID=T-TEST-0080",
    expected: { arch: "arm", state: "collected", tizen: "8.0.0", firmware: "T-TEST-0080" },
  },
  {
    name: "bounded read excludes trailing fields",
    text: "x".repeat(16384) + "\nVERSION_ID=9.0.0\nBUILD_ID=T-TEST-0090",
    expected: { arch: "arm", state: "partial", tizen: null, firmware: null, reason: "os_release_fields_missing" },
  },
  {
    name: "unavailable",
    error: new Error("unavailable"),
    expected: { ...initialEnvironment, state: "unavailable", reason: "os_release_unavailable" },
  },
];

for (const { name, packet, expected } of packets) {
  for (const environment of environments) {
    test(`service metadata: ${name}; environment ${environment.name}`, () => {
      let finish;
      let reads = 0;
      const context = createDiagnosticsContext({
        privacy: createDiagnosticsPrivacy(),
        build: packet?.build,
        arch: "arm",
        now: () => fixedNow,
        read: (done) => {
          reads++;
          finish = done;
        },
      });
      const snapshot = () => normalise(context.enrich({ records: [] }, control, state));
      assert.equal(snapshot().ui, null);
      context.accept({ health: { buffered: 2 }, queued: 2 });
      context.accept(packet);
      const before = {
        records: [],
        build: expected.build,
        environment: initialEnvironment,
        ui: expected,
        context: expectedContext,
      };
      assert.deepEqual(snapshot(), before);
      context.start();
      context.start();
      assert.equal(reads, 1);
      finish(environment.error ?? null, environment.text);
      assert.deepEqual(snapshot(), { ...before, environment: environment.expected });
      assert.doesNotMatch(JSON.stringify(snapshot()), /PRIVATE|private-session/);
    });
  }
}

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

function storageTrace(scenario) {
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
  openDiagnosticsStore(
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

const MAX_LOG_BYTES = 256 * 1024;
const LOG_FILE = "/virtual/private space/aerotizen-diagnostics-v1.json";
const TEMPORARY_FILE = LOG_FILE + ".tmp";
const RESOLVE = ["resolve", "wgt-private", "rw"];
const OPEN = [RESOLVE, ["ready", true]];
const STAT = ["stat", LOG_FILE];
const READ = ["read", LOG_FILE, "utf8"];
const WRITE = ["write", TEMPORARY_FILE, 2, "utf8", 0o600];
const RENAME = ["rename", TEMPORARY_FILE, LOG_FILE];
const UNLINK = ["unlink", TEMPORARY_FILE];
const LOADED = ["loaded", null, 2];
const SAVED = ["saved", null];
const LOAD = [STAT, READ, LOADED];
const SAVE = [WRITE, RENAME, SAVED];

for (const { name, scenario, expected } of [
  { name: "atomic private write", scenario: {}, expected: [...OPEN, ...LOAD, ...SAVE] },
  { name: "absent filesystem", scenario: { absent: true }, expected: [["ready", false]] },
  { name: "denied private directory", scenario: { failure: "resolve" }, expected: [RESOLVE, ["ready", false]] },
  { name: "throwing resolver", scenario: { failure: "throw" }, expected: [RESOLVE, ["ready", false]] },
  { name: "relative file URI", scenario: { uri: "file://relative/private" }, expected: [RESOLVE, ["ready", false]] },
  { name: "malformed URI escape", scenario: { uri: "file:///invalid%URI" }, expected: [RESOLVE, ["ready", false]] },
  { name: "missing file", scenario: { failure: "stat" }, expected: [...OPEN, STAT, ["loaded", null, null], ...SAVE] },
  {
    name: "read failure",
    scenario: { failure: "read" },
    expected: [...OPEN, STAT, READ, ["loaded", "read failed", null], ...SAVE],
  },
  {
    name: "write failure removes the temporary file",
    scenario: { failure: "write" },
    expected: [...OPEN, ...LOAD, WRITE, UNLINK, ["saved", "write failed"]],
  },
  {
    name: "rename failure removes the temporary file",
    scenario: { failure: "rename" },
    expected: [...OPEN, ...LOAD, WRITE, RENAME, UNLINK, ["saved", "rename failed"]],
  },
  {
    name: "cleanup failure preserves the original error",
    scenario: { failure: "rename", cleanupFailure: true },
    expected: [...OPEN, ...LOAD, WRITE, RENAME, UNLINK, ["saved", "rename failed"]],
  },
  {
    name: "exact byte limit",
    scenario: { payload: "x".repeat(MAX_LOG_BYTES) },
    expected: [
      ...OPEN,
      STAT,
      READ,
      ["loaded", null, MAX_LOG_BYTES],
      ["write", TEMPORARY_FILE, MAX_LOG_BYTES, "utf8", 0o600],
      RENAME,
      SAVED,
    ],
  },
  {
    name: "oversized file is not read or written",
    scenario: { payload: "x".repeat(MAX_LOG_BYTES + 1) },
    expected: [...OPEN, STAT, ["loaded", null, null], ["saved", "Log size limit"]],
  },
  {
    name: "UTF-8 bytes are checked after a misleading stat",
    scenario: { size: 0, payload: "😀".repeat(65537) },
    expected: [...OPEN, STAT, READ, ["loaded", null, null], ["saved", "Log size limit"]],
  },
]) {
  test(`service log storage: ${name}`, () => assert.deepEqual(storageTrace(scenario), expected));
}
