const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const schema = require("../launcher/src/diagnostics/privacySchema.json");
const { createDiagnosticsPrivacy } = loadTypeScript("launcher/src/diagnostics/createDiagnosticsPrivacy.ts");

const MAX_DIAGNOSTIC_NUMBER = 1e16;
const MAX_STACK_FRAMES = 8;

test("diagnostic counts accept bounded nonnegative numbers without coercion", () => {
  const privacy = createDiagnosticsPrivacy();
  for (const field of schema.numbers) {
    for (const value of [0, 1.5, MAX_DIAGNOSTIC_NUMBER]) assert.equal(privacy.value(value, field), value, field);
    for (const value of [null, undefined, -1, MAX_DIAGNOSTIC_NUMBER + 2, NaN, Infinity, "1", true, {}, []])
      assert.equal(privacy.value(value, field), null, field);
  }
});

test("diagnostic flags accept booleans without coercion", () => {
  const privacy = createDiagnosticsPrivacy();
  for (const field of schema.bools) {
    for (const value of [true, false]) assert.equal(privacy.value(value, field), value, field);
    for (const value of [null, undefined, 0, 1, "true", {}, []]) assert.equal(privacy.value(value, field), null, field);
  }
});

test("diagnostic enums and event names use the published schema allowlists", () => {
  const privacy = createDiagnosticsPrivacy();
  for (const [field, choices] of Object.entries(schema.enums)) {
    for (const value of choices) assert.equal(privacy.value(value, field), value, field);
    for (const value of [null, undefined, "PRIVATE-PAYLOAD", 0, true, {}, []])
      assert.equal(privacy.value(value, field), null, field);
  }
  for (const event of schema.events) assert.equal(privacy.event(event), event);
  for (const event of [null, undefined, "PRIVATE-PAYLOAD", 0, true, {}, []])
    assert.equal(privacy.event(event), "diagnostic.unknown");
});

test("private identifiers get stable aliases while known apps and existing aliases survive", () => {
  const privacy = createDiagnosticsPrivacy();
  for (const id of schema.app_ids) assert.equal(privacy.value(id, "app_id"), id);
  assert.equal(privacy.value("private.app", "app_id"), "app-1");
  assert.equal(privacy.value("private.app", "app_id"), "app-1");
  assert.equal(privacy.value("another.private.app", "app_id"), "app-2");
  assert.equal(privacy.value("app-9", "app_id"), "app-9");
  const reference = privacy.value("PRIVATE-ID", "id");
  assert.match(reference, /^d-[a-f0-9]{8}-[0-9]+$/);
  assert.equal(privacy.value("PRIVATE-ID", "session"), reference);
  assert.equal(privacy.value("PRIVATE-ID", "operation_id"), reference);
  for (const field of ["id", "session", "operation_id"]) {
    assert.equal(privacy.value("d-12345678-0", field), "d-12345678-0");
  }
  for (const field of ["app_id", "id", "session", "operation_id"]) {
    for (const value of [null, undefined, true, 0, {}, [], "x".repeat(257)])
      assert.equal(privacy.value(value, field), null, field);
  }
});

test("diagnostic errors and reasons keep known categories without retaining private messages", () => {
  const privacy = createDiagnosticsPrivacy();
  for (const field of ["error", "error_type"]) {
    for (const value of schema.errors) assert.equal(privacy.value(value, field), value);
    for (const value of ["PRIVATE-PAYLOAD", {}, [], 0, true]) assert.equal(privacy.value(value, field), "Error");
  }
  for (const value of schema.reasons) assert.equal(privacy.value(value, "reason"), value);
  for (const [input, expected] of [
    ["Cannot read PRIVATE-PAYLOAD", "property_access_failed"],
    ["PRIVATE-PAYLOAD is not defined", "reference_unavailable"],
    ["Unexpected token PRIVATE-PAYLOAD", "invalid_syntax"],
    ["launch denied: PRIVATE-PAYLOAD", "launch_denied"],
    ["launch failed: PRIVATE-PAYLOAD", "launch_failed"],
    ["PRIVATE-PAYLOAD", "detail_omitted"],
    [true, "detail_omitted"],
    [{}, "detail_omitted"],
  ]) {
    assert.equal(privacy.value(input, "message"), expected);
    assert.equal(privacy.value(input, "reason"), expected);
  }
  assert.equal(privacy.value("home pressed in PRIVATE-APP", "reason"), "home_pressed_in_app");
  for (const reason of ["Art status: on", "fresh Art status: unknown", "HomeWatcher HTTP 599"])
    assert.equal(privacy.value(reason, "reason"), reason);
});

for (const { field, valid, invalid } of [
  {
    field: "operation",
    valid: ["main", "default", "view", "service"].map((name) => "http://tizen.org/appcontrol/operation/" + name),
    invalid: ["https://private.example/view", "http://tizen.org/appcontrol/operation/private"],
  },
  { field: "version", valid: ["9.0", "2.4.0", "123.456.789.0"], invalid: ["PRIVATE", "1", "1234.0", "1.2.3.4.5"] },
  { field: "tizen", valid: ["9.0", "2.4.0"], invalid: ["PRIVATE", "1", "1234.0"] },
  {
    field: "build_id",
    valid: ["a".repeat(40), "a".repeat(64)],
    invalid: ["a".repeat(39), "a".repeat(65), "A".repeat(64), "PRIVATE"],
  },
  { field: "commit", valid: ["b".repeat(40), "b".repeat(64)], invalid: ["b".repeat(39), "b".repeat(65), "PRIVATE"] },
  { field: "firmware", valid: ["T-TEST-0090", "A1"], invalid: ["PRIVATE", "../PRIVATE1", "a1", "A" + "1".repeat(128)] },
]) {
  test(`diagnostic ${field} validates its format and rejects malformed values`, () => {
    const privacy = createDiagnosticsPrivacy();
    for (const value of valid) assert.equal(privacy.value(value, field), value);
    for (const value of [...invalid, null, undefined, true, 0, {}, []]) assert.equal(privacy.value(value, field), null);
  });
}

test("diagnostic sources and stacks retain only known filenames and bounded frame locations", () => {
  const privacy = createDiagnosticsPrivacy();
  for (const file of schema.source_files) {
    assert.equal(privacy.value("/private/path/" + file + "?token=PRIVATE", "file"), file);
    assert.equal(privacy.value("C:\\private\\" + file, "file"), file);
  }
  for (const value of ["private.js", "PRIVATE-PAYLOAD", {}, [], true, 0])
    assert.equal(privacy.value(value, "file"), "[unknown source]");
  const frame = " at f (file:///private/launcher-ui.js:20:6)";
  const stack = ["TypeError: PRIVATE-PAYLOAD", " at /private/unknown.js:9:1", ...Array(20).fill(frame)].join("\n");
  assert.equal(privacy.value(stack, "stack"), Array(MAX_STACK_FRAMES).fill("launcher-ui.js:20:6").join("\n"));
  assert.equal(privacy.value({}, "stack"), "");
});

test("diagnostic details retain allowed fields and sanitize private error locations", () => {
  const privacy = createDiagnosticsPrivacy();
  const fields = Object.freeze({
    action: "open",
    method: "app_control",
    duration_ms: 1.5,
    mode: "watcher",
    operation: "http://tizen.org/appcontrol/operation/main",
    app_id: "com.samsung.tv.csfs",
    error: "TypeError",
    reason: "boot",
    status: "ok",
    phase: "boot",
    line: 42,
    component: "service",
    version: "2.4.0",
    hidden: false,
    operation_id: "d-12345678-0",
    column: 9,
    code: 100,
    build_id: "a".repeat(64),
    commit: "b".repeat(40),
    dirty: false,
  });
  assert.deepEqual(
    privacy.details({
      ...fields,
      message: "Cannot read PRIVATE-PAYLOAD",
      file: "/private/launcher-ui.js?token=PRIVATE",
      stack: " at f (file:///private/launcher-ui.js:42:9)",
      payload: "PRIVATE-PAYLOAD",
    }),
    { ...fields, message: "property_access_failed", file: "launcher-ui.js", stack: "launcher-ui.js:42:9" },
  );
});

test("diagnostic details omit unknown, inherited and nonprimitive fields", () => {
  const privacy = createDiagnosticsPrivacy();
  assert.deepEqual(
    privacy.details({
      message: "Cannot read PRIVATE",
      duration_ms: "9",
      dirty: false,
      hidden: true,
      file: "/private/launcher-ui.js",
      payload: "PRIVATE",
      token: "PRIVATE",
      stack: {},
      app_id: [],
      reason: null,
    }),
    {
      duration_ms: null,
      hidden: true,
      message: "property_access_failed",
      file: "launcher-ui.js",
      dirty: false,
    },
  );
  for (const value of [null, undefined, "PRIVATE", true, [], Object.create({ message: "Cannot read PRIVATE" })])
    assert.deepEqual(privacy.details(value), {});
  assert.equal(privacy.value("PRIVATE", "unknown_field"), null);
});
