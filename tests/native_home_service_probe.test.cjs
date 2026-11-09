"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../launcher/service/native-home-diagnostic.js"), "utf8");
const readQuery = {
  schema_version: 1,
  read_only: true,
  uid: 5001,
  architecture_bits: 32,
  os_release: { ID: "tizen", BUILD_ID: "T-TEST-1245.5" },
  main_operation: { status: "ok", value: "com.samsung.tv.csfs" },
  settings: Object.fromEntries([
    ...["home_appid", "startup_appid", "booting_appid_backup"].map((key) => [
      "db/appfw/" + key,
      { status: "ok", value: "com.samsung.tv.csfs" },
    ]),
    ["db/first_screen/type", { status: "ok", value: "1" }],
    ["db/menu/smart_hub/ontvsetting/auto_start", { status: "ok", value: 1 }],
  ]),
};
const reply = "AEROTIZEN_SERVICE_HOME=" + JSON.stringify(readQuery);

function harness(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aerotizen-service-probe-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const helpers = path.join(directory, "native-home-probe");
  fs.mkdirSync(helpers);
  const hashes = {};
  for (const assembly of ["AeroTizenServiceHomeProbe", "AeroTizenServiceHomeWriteProbe"]) {
    for (const suffix of [".dll", ".runtimeconfig.json"]) {
      const name = assembly + suffix;
      fs.writeFileSync(path.join(helpers, name), "test payload");
      hashes[name] = crypto.createHash("sha256").update("test payload").digest("hex");
    }
  }
  fs.writeFileSync(path.join(helpers, "manifest.json"), JSON.stringify({ schema_version: 1, files: hashes }));
  const marker = path.join(directory, "aerotizen-native-home-probe-v2-get.json");
  const launches = [];
  const timers = [];
  const fileSystem = Object.create(fs);
  fileSystem.statSync = (file) => {
    if (["/etc/os-release", "/proc/self/attr/current"].includes(file)) return { size: 100 };
    return fs.statSync(file);
  };
  fileSystem.readFileSync = (file, encoding) => {
    if (file === "/etc/os-release") return options.host ? "ID=other" : 'ID="tizen"\nVERSION_ID="10.0"';
    if (file === "/proc/self/attr/current") return "User::Pkg::DclHome001";
    return fs.readFileSync(file, encoding);
  };
  fileSystem.accessSync = (file, mode) => {
    assert.equal(file, "/usr/bin/dotnet");
    assert.equal(mode, fs.constants.X_OK);
    if (options.denied) throw Object.assign(new Error("private /path must stay hidden"), { code: "EACCES" });
  };
  const child = {
    execFile(file, args, settings, done) {
      assert.equal(fs.existsSync(marker), true, "durable marker must precede execution");
      launches.push({ file, args, settings, done });
    },
  };
  const tz = { filesystem: { resolve: (name, done) => done({ toURI: () => "file://" + directory }) } };
  let handler;
  function reload() {
    const context = {
      __dirname: path.join(directory, "service"),
      module: { exports: {} },
      process: {
        arch: "arm",
        getuid: () => 5001,
        getgid: () => 100,
        binding(name) {
          assert.equal(name, "spawn_sync");
          return {
            spawn(settings) {
              assert.equal(fs.existsSync(marker), true);
              launches.push(settings);
              return options.bindingResult || { status: 0, output: [null, Buffer.from(reply), null] };
            },
          };
        },
      },
      setTimeout: (callback) => timers.push(callback),
      require(name) {
        if (name === "fs") return fileSystem;
        if (["path", "crypto", "util"].includes(name)) return require("node:" + name);
        assert.equal(name, "child_process");
        if (options.binding) throw new Error("module stripped");
        return child;
      },
    };
    vm.runInNewContext(source, context);
    handler = context.module.exports;
  }
  reload();
  function request(method = "GET", headers = {}, url = "/diagnostics/native-home") {
    const result = {};
    handler(
      { method, url, headers: { "x-aerotizen-home-probe": "read-only-v1", ...headers } },
      {
        writeHead(code, responseHeaders) {
          result.code = code;
          result.headers = responseHeaders;
        },
        end(body) {
          result.body = JSON.parse(body);
        },
      },
      tz,
    );
    return result;
  }
  return { request, launches, timers, marker, reload, helpers, directory };
}

test("query endpoint and module load never execute a process or create a marker", (t) => {
  const h = harness(t);
  assert.equal(h.request().body.status, "not_run");
  assert.equal(h.launches.length, 0);
  assert.equal(h.timers.length, 0);
  assert.equal(fs.existsSync(h.marker), false);
  for (const [method, headers, url] of [
    ["POST", { origin: "https://example.com" }],
    ["POST", { "x-aerotizen-home-probe": "" }],
    ["POST", {}, "/diagnostics/native-home?command=id"],
    ["POST", { "content-length": "1" }],
    ["POST", { "transfer-encoding": "chunked" }],
    ["DELETE", {}],
  ]) {
    assert.ok(h.request(method, headers, url).code >= 400);
  }
  assert.equal(h.request("OPTIONS", { origin: "null" }).code, 200);
  assert.equal(fs.existsSync(h.marker), false);
});

test("explicit run is durable, bounded, fixed, and cached across concurrent requests and reloads", (t) => {
  const h = harness(t);
  assert.equal(h.request("POST", { origin: "null" }).code, 202);
  assert.equal(h.request("POST").body.status, "launch_requested");
  assert.equal(h.launches.length, 0, "response is sent before scheduling the fork");
  h.timers.shift()();
  const call = h.launches[0];
  assert.equal(call.file, "/usr/bin/dotnet");
  assert.deepEqual([...call.args], [path.join(h.helpers, "AeroTizenServiceHomeProbe.dll")]);
  assert.equal(call.settings.timeout, 5000);
  assert.equal(call.settings.maxBuffer, 32768);
  assert.equal(call.settings.shell, false);
  call.done(null, reply, "private stderr must stay hidden");
  h.reload();
  const report = h.request("POST").body;
  assert.equal(report.status, "query_completed");
  assert.equal(report.query.uid, 5001);
  assert.equal(report.native_home_supported, null);
  assert.equal(h.launches.length, 1);
  assert.equal(h.timers.length, 0);
  assert.ok(!JSON.stringify(report).includes("private"));
});

test("an interrupted service leaves a report and blocks a second execution", (t) => {
  const h = harness(t);
  h.request("POST");
  h.timers.shift()();
  h.reload();
  assert.equal(h.request().body.status, "interrupted");
  assert.equal(h.request("POST").body.status, "interrupted");
  assert.equal(h.launches.length, 1);
  assert.equal(h.timers.length, 0);
});

test("permission failure and helper corruption stop before the fork", (t) => {
  for (const denied of [true, false]) {
    const h = harness(t, { denied });
    if (!denied) fs.appendFileSync(path.join(h.helpers, "AeroTizenServiceHomeProbe.dll"), "altered");
    h.request("POST");
    h.timers.shift()();
    const result = h.request().body;
    assert.equal(result.status, "execution_failed");
    assert.equal(result.execution.error, denied ? "EACCES" : "unavailable");
    assert.equal(h.launches.length, 0);
    assert.ok(!JSON.stringify(result).includes("private /path"));
  }
});

test("stripped child_process uses a bounded binding with a fixed argument list", (t) => {
  const h = harness(t, { binding: true });
  h.request("POST");
  h.timers.shift()();
  assert.equal(h.launches[0].timeout, 5000);
  assert.equal(h.launches[0].maxBuffer, 32768);
  assert.equal(h.request().body.execution.method, "spawn_sync");
  assert.equal(h.request().body.query.uid, 5001);
});

test("execution timeout and malformed output retain no raw output", (t) => {
  const h = harness(t);
  h.request("POST");
  h.timers.shift()();
  h.launches[0].done({ killed: true, signal: "SIGTERM", message: "private details" }, "secret output");
  const report = h.request().body;
  assert.equal(report.execution.error, "ETIMEDOUT");
  assert.equal(report.execution.signal, "SIGTERM");
  assert.equal(report.execution.reply, "no_valid_query");
  assert.ok(!JSON.stringify(report).includes("secret"));
});

test("a successful process exit without a helper reply cannot report query completion", (t) => {
  const h = harness(t);
  h.request("POST");
  h.timers.shift()();
  h.launches[0].done(null, "");
  const report = h.request().body;
  assert.equal(report.status, "no_query_result");
  assert.equal(report.query, null);
  assert.equal(report.native_home_supported, null);
});

test("helper imports only native getters and memory release", () => {
  const code = fs.readFileSync(path.join(__dirname, "../cli/native/home-service-probe/HomeServiceProbe.cs"), "utf8");
  const names = [...code.matchAll(/extern\s+\w+\s+(\w+)\(/g)].map((match) => match[1]).sort();
  assert.deepEqual(names, ["app_operation_get_current_app", "free", "getuid", "vconf_get_int", "vconf_get_str"]);
});

test("a developer computer cannot start the diagnostic", (t) => {
  const h = harness(t, { host: true });
  assert.equal(h.request("POST").code, 409);
  assert.equal(h.launches.length, 0);
  assert.equal(h.timers.length, 0);
  assert.equal(fs.existsSync(h.marker), false);
});

test("Set test needs complete getters and writes only its fixed baseline file", (t) => {
  const h = harness(t);
  const headers = { "x-aerotizen-home-probe": "diagnostic-v2" };
  const set = () => h.request("POST", headers, "/diagnostics/native-home/set");
  assert.equal(set().code, 409);
  assert.equal(h.timers.length, 0);
  h.request("POST");
  h.timers.shift()();
  h.launches[0].done(null, reply);
  assert.equal(h.request().body.can_set, true);
  assert.equal(set().code, 202);
  assert.equal(set().code, 200);
  assert.equal(h.timers.length, 1);
  h.timers.shift()();
  const call = h.launches[1];
  assert.equal(call.args[0], path.join(h.helpers, "AeroTizenServiceHomeWriteProbe.dll"));
  assert.equal(call.args[1], path.join(h.directory, "aerotizen-native-home-set-baseline-v2.json"));
  assert.deepEqual(JSON.parse(fs.readFileSync(call.args[1], "utf8")), readQuery);
  call.done(
    null,
    "AEROTIZEN_SERVICE_HOME_SET=" +
      JSON.stringify({
        schema_version: 1,
        read_only: false,
        same_values: true,
        success: true,
        baseline_unchanged: true,
        steps: [],
      }),
  );
  const report = h.request().body;
  assert.equal(report.set_test.read_only, false);
  assert.equal(report.set_test.query.baseline_unchanged, true);
  assert.equal(report.can_set, false);
  assert.equal(set().code, 200);
  assert.equal(h.launches.length, 2);
});

test("an incomplete getter result blocks Set test before a marker or process", (t) => {
  const h = harness(t);
  h.request("POST");
  h.timers.shift()();
  h.launches[0].done(null, "AEROTIZEN_SERVICE_HOME=" + JSON.stringify({ ...readQuery, uid: null }));
  assert.equal(h.request().body.can_set, false);
  assert.equal(
    h.request("POST", { "x-aerotizen-home-probe": "diagnostic-v2" }, "/diagnostics/native-home/set").code,
    409,
  );
  assert.equal(h.launches.length, 1);
  assert.equal(fs.existsSync(path.join(h.directory, "aerotizen-native-home-probe-v2-set.json")), false);
});

test("a saved result from another getter build leaves Set test disabled", (t) => {
  const h = harness(t);
  h.request("POST");
  h.timers.shift()();
  h.launches[0].done(null, reply);
  const report = JSON.parse(fs.readFileSync(h.marker, "utf8"));
  report.helper_sha256 = "previous-build";
  fs.writeFileSync(h.marker, JSON.stringify(report));
  assert.equal(h.request().body.can_set, false);
  assert.equal(
    h.request("POST", { "x-aerotizen-home-probe": "diagnostic-v2" }, "/diagnostics/native-home/set").code,
    409,
  );
  assert.equal(h.timers.length, 0);
  assert.equal(h.launches.length, 1);
});

test("an interrupted setter retains its last native step and cannot run twice", (t) => {
  const h = harness(t);
  h.request("POST");
  h.timers.shift()();
  h.launches[0].done(null, reply);
  const headers = { "x-aerotizen-home-probe": "diagnostic-v2" };
  h.request("POST", headers, "/diagnostics/native-home/set");
  h.timers.shift()();
  fs.writeFileSync(
    path.join(h.directory, "aerotizen-native-home-set-progress-v2.json"),
    JSON.stringify({
      schema_version: 1,
      read_only: false,
      same_values: true,
      steps: [{ key: "operation/main", status: "requested" }],
    }),
  );
  h.reload();
  const result = h.request().body.set_test;
  assert.equal(result.status, "interrupted");
  assert.equal(result.query.steps[0].key, "operation/main");
  h.request("POST", headers, "/diagnostics/native-home/set");
  assert.equal(h.timers.length, 0);
  assert.equal(h.launches.length, 2);
});
