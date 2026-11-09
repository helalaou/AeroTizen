"use strict";
// Temporary #188 tester. No caller-supplied command, argument, path, or setting is accepted.
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var TIMEOUT = 5000;
var LIMIT = 32768;
var running = false;
var prefix = "AEROTIZEN_SERVICE_HOME=";

function failure(error) {
  return ["EACCES", "EPERM", "ENOENT", "ENOEXEC", "ENOSYS", "ETIMEDOUT", "ENOBUFS", "EEXIST"].indexOf(
    error && error.code,
  ) >= 0
    ? error.code
    : "unavailable";
}
function read(file) {
  if (fs.statSync(file).size > LIMIT) throw new Error("Size limit");
  return fs.readFileSync(file, "utf8");
}
function save(file, report, exclusive) {
  var target = exclusive ? file : file + ".tmp";
  var descriptor = fs.openSync(target, exclusive ? "wx" : "w", 384);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(report), "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (!exclusive) fs.renameSync(target, file);
  descriptor = fs.openSync(path.dirname(file), "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}
function context() {
  var value = { uid: process.getuid(), gid: process.getgid(), arch: process.arch, smack: null };
  try {
    var label = read("/proc/self/attr/current").trim();
    if (/^[A-Za-z0-9_:.-]{1,128}$/.test(label)) value.smack = label;
  } catch (e) {
    /* Some retail builds hide the process label. */
  }
  return value;
}
function query(output) {
  var line = String(output || "")
    .split("\n")
    .filter(function (item) {
      return item.indexOf(prefix) === 0;
    });
  if (line.length !== 1) throw new Error("Missing query reply");
  var value = JSON.parse(line[0].slice(prefix.length));
  if (value.schema_version !== 1 || value.read_only !== true) throw new Error("Invalid query reply");
  return value;
}
function launch(file, report) {
  function finish(error, stdout, signal) {
    report.status = error ? "execution_failed" : "query_completed";
    report.execution.error = error ? failure(error) : null;
    report.execution.exit_code = error && typeof error.code === "number" ? error.code : error ? null : 0;
    report.execution.signal = ["SIGKILL", "SIGTERM", "SIGABRT", "SIGSEGV"].indexOf(signal) >= 0 ? signal : null;
    try {
      report.query = query(stdout);
      report.execution.reply = "query_received";
    } catch (e) {
      report.execution.reply = "no_valid_query";
    }
    running = false;
    try {
      save(file, report, false);
    } catch (e) {
      // The durable pre-launch marker still prevents an automatic repeat.
    }
  }
  try {
    report.stage = "verify_payload";
    var executable = "/usr/bin/dotnet";
    var directory = path.join(__dirname, "../native-home-probe");
    var helper = path.join(directory, "AeroTizenServiceHomeProbe.dll");
    var manifest = JSON.parse(read(path.join(directory, "manifest.json")));
    ["AeroTizenServiceHomeProbe.dll", "AeroTizenServiceHomeProbe.runtimeconfig.json"].forEach(function (name) {
      var contents = fs.readFileSync(path.join(directory, name));
      if (
        contents.length > 1024 * 1024 ||
        crypto.createHash("sha256").update(contents).digest("hex") !== manifest.files[name]
      )
        throw new Error("Helper checksum differs");
    });
    report.helper_sha256 = manifest.files["AeroTizenServiceHomeProbe.dll"];
    report.stage = "runtime_access";
    fs.accessSync(executable, fs.constants.X_OK);
    report.stage = "process_support";
    var child = null;
    try {
      child = require("child_process");
    } catch (e) {
      /* Samsung strips this module on some web service runtimes. */
    }
    if (child && typeof child.execFile === "function") {
      report.execution.method = "execFile";
      report.stage = "launch_helper";
      save(file, report, false);
      child.execFile(
        executable,
        [helper],
        {
          timeout: TIMEOUT,
          maxBuffer: LIMIT,
          killSignal: "SIGKILL",
          encoding: "utf8",
          shell: false,
          env: { DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
        },
        function (error, stdout) {
          if (error && error.killed) error.code = "ETIMEDOUT";
          finish(error, stdout, error && error.signal);
        },
      );
    } else {
      var binding = process.binding("spawn_sync");
      if (!binding || typeof binding.spawn !== "function") throw new Error("Process binding unavailable");
      report.execution.method = "spawn_sync";
      report.stage = "launch_helper";
      save(file, report, false);
      var result = binding.spawn({
        file: executable,
        args: [executable, helper],
        envPairs: ["DOTNET_CLI_TELEMETRY_OPTOUT=1"],
        stdio: [
          { type: "ignore" },
          { type: "pipe", readable: false, writable: true },
          { type: "pipe", readable: false, writable: true },
        ],
        timeout: TIMEOUT,
        maxBuffer: LIMIT,
        killSignal: 9,
      });
      var error = null;
      if (result.error) error = { code: require("util").getSystemErrorName(result.error) };
      else if (result.status !== 0 || result.signal) error = { code: result.status };
      finish(error, result.output && result.output[1], result.signal);
    }
  } catch (e) {
    finish(e, null, null);
  }
}

module.exports = function (req, res, tz) {
  var headers = req.headers || {};
  function reply(code, value) {
    var responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    if (headers.origin === "null" || headers.origin === "file://") {
      responseHeaders["Access-Control-Allow-Origin"] = headers.origin;
      responseHeaders["Access-Control-Allow-Headers"] = "X-AeroTizen-Home-Probe";
      responseHeaders["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    }
    res.writeHead(code, responseHeaders);
    res.end(JSON.stringify(value));
  }
  if (headers.origin && headers.origin !== "null" && headers.origin !== "file://") {
    reply(403, { error: "Local diagnostic required" });
    return;
  }
  if (req.method === "OPTIONS") {
    reply(200, { read_only: true });
    return;
  }
  if (headers["x-aerotizen-home-probe"] !== "read-only-v1") {
    reply(403, { error: "Explicit diagnostic header required" });
    return;
  }
  if (["GET", "POST"].indexOf(req.method) < 0 || req.url !== "/diagnostics/native-home") {
    reply(400, { error: "Use GET or POST without parameters" });
    return;
  }
  if (headers["transfer-encoding"] || (headers["content-length"] && headers["content-length"] !== "0")) {
    reply(400, { error: "Request body is not supported" });
    return;
  }
  if (!tz || !tz.filesystem || !tz.filesystem.resolve) {
    reply(503, { error: "TV private storage unavailable" });
    return;
  }
  try {
    tz.filesystem.resolve(
      "wgt-private",
      function (directory) {
        try {
          var uri = directory.toURI();
          if (uri.indexOf("file:///") !== 0) throw new Error("Private directory unavailable");
          var file = decodeURIComponent(uri.slice(7)).replace(/\/$/, "") + "/aerotizen-native-home-probe-v1.json";
          try {
            var previous = JSON.parse(read(file));
            if (previous.schema_version !== 1 || previous.probe !== "aerotizen-native-home-service")
              throw new Error("Invalid previous attempt");
            if (previous.status === "launch_requested" && !running) previous.status = "interrupted";
            reply(200, previous);
            return;
          } catch (e) {
            if (e.code !== "ENOENT") {
              reply(409, { error: "Previous attempt cannot be read; repeat blocked" });
              return;
            }
          }
          var report = {
            probe: "aerotizen-native-home-service",
            schema_version: 1,
            read_only: true,
            native_home_supported: null,
            status: "not_run",
            stage: "idle",
            service: context(),
            execution: { method: null, error: null, signal: null, exit_code: null },
            query: null,
          };
          if (req.method === "GET") {
            reply(200, report);
            return;
          }
          if (!/^ID=["']?tizen["']?\r?$/m.test(read("/etc/os-release"))) {
            reply(409, { error: "Tizen runtime required" });
            return;
          }
          report.status = "launch_requested";
          save(file, report, true);
          running = true;
          reply(202, report);
          // Let the response leave before Samsung's runtime attempts the fork.
          setTimeout(function () {
            launch(file, report);
          }, 150);
        } catch (e) {
          reply(409, { error: failure(e) });
        }
      },
      function () {
        reply(503, { error: "TV private storage unavailable" });
      },
      "rw",
    );
  } catch (e) {
    reply(503, { error: "TV private storage unavailable" });
  }
};
