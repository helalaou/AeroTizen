/* global module */
// Structured support data only. No account values, content titles or arbitrary messages.
(function (root) {
  'use strict';
  var schema = {
  "app_ids": [
    "DclHome001.Home",
    "com.samsung.tv.csfs",
    "org.tizen.hbbtv",
    "org.tizen.tv-viewer"
  ],
  "events": [
    "app.launch_accepted",
    "app.launch_failed",
    "app.launch_requested",
    "app.launch_result",
    "app.launch_unavailable",
    "app.visibility",
    "command.finish",
    "command.start",
    "device.operation",
    "diagnostic.unknown",
    "handoff.accepted",
    "handoff.failed",
    "handoff.request",
    "handoff.visibility_unconfirmed",
    "home.native_result",
    "home.prepared",
    "service.exit",
    "service.launch_requested",
    "service.mode",
    "service.request",
    "service.start",
    "service.unavailable",
    "ui.appcontrol",
    "ui.error",
    "ui.loaded",
    "ui.rejection",
    "ui.start",
    "ui.visibility",
    "watcher.art-status",
    "watcher.blocked",
    "watcher.cancelled",
    "watcher.capability",
    "watcher.checking",
    "watcher.launch",
    "watcher.unseen",
    "watcher.unwatched"
  ],
  "errors": [
    "ConnectionError",
    "ConnectionRefusedError",
    "Denied",
    "DeviceSessionError",
    "Error",
    "EvalError",
    "FileNotFoundError",
    "HTTPError",
    "HTTPException",
    "HandoffError",
    "HomeError",
    "IOError",
    "InvalidValuesError",
    "KeyError",
    "LaunchError",
    "NetworkError",
    "NotFoundError",
    "NotSupportedError",
    "OSError",
    "PermissionError",
    "RangeError",
    "RecursionError",
    "ReferenceError",
    "RequestFailed",
    "RuntimeError",
    "ScriptError",
    "SdbError",
    "SecurityError",
    "SyntaxError",
    "SystemExit",
    "TimeoutError",
    "TypeError",
    "URIError",
    "URLError",
    "UnhandledRejection",
    "UnknownError",
    "ValueError"
  ],
  "reasons": [
    "AppControl failed",
    "AppControl is unavailable",
    "Home routing mode changed",
    "HomeWatcher request failed",
    "HomeWatcher unavailable",
    "Native Home or handoff mode",
    "Samsung Home escape",
    "TV capability unknown",
    "TV power state unavailable or not on",
    "TV tuner selection is unavailable",
    "another app is active",
    "app inventory changed",
    "app inventory unavailable",
    "app launch requested",
    "boot",
    "boot (TV type unknown)",
    "covered without an app",
    "final Art check blocked",
    "frame",
    "guard deadline",
    "home_pressed_in_app",
    "launch denied",
    "launch failed",
    "launcher returned",
    "launcher visible or status unavailable",
    "non-frame",
    "off",
    "on",
    "os_release_fields_missing",
    "os_release_unavailable",
    "service exit",
    "unknown",
    "watched app visible or status unavailable"
  ],
  "numbers": [
    "at",
    "buffered",
    "cli_files",
    "code",
    "column",
    "discarded",
    "duration_ms",
    "elapsed_ms",
    "invalid",
    "last_status",
    "line",
    "omitted_legacy_records",
    "pending_errors",
    "protocol",
    "queued",
    "read_failures",
    "receipt_summaries",
    "reported_at",
    "retries",
    "sequence",
    "skipped_files",
    "uid",
    "watcher_heartbeats",
    "watcher_launch_calls",
    "write_failures",
    "writes"
  ],
  "bools": [
    "RolledBack",
    "Success",
    "accepted",
    "boot",
    "complete",
    "dirty",
    "failed",
    "hidden",
    "persistent",
    "query_staging_cleaned",
    "reachable",
    "saving",
    "sdk_staging_cleaned",
    "size_limit_reached",
    "unsaved"
  ],
  "source_files": [
    "__init__.py",
    "__main__.py",
    "app-catalog.js",
    "app-lookup.js",
    "apps.js",
    "artmode.js",
    "artwork.js",
    "backgrounds.js",
    "brands.js",
    "build-info.js",
    "build_info.py",
    "catalog.py",
    "cdp.py",
    "certs.py",
    "cli.py",
    "clock.js",
    "config.js",
    "continue-row.js",
    "continue-watching.js",
    "device.py",
    "diagnostic_privacy.py",
    "diagnostics-context.js",
    "diagnostics-privacy.js",
    "diagnostics-storage.js",
    "diagnostics-store.js",
    "diagnostics.js",
    "diagnostics.py",
    "discover.py",
    "dom.js",
    "fireplace.js",
    "home-mode.js",
    "home-screen.js",
    "home-store.js",
    "home.py",
    "home_control.py",
    "homewatch.js",
    "index.html",
    "index.js",
    "inputs.js",
    "inspect_app.py",
    "logos.js",
    "main.js",
    "native-navigation.js",
    "network.js",
    "photo-weather.js",
    "releases.py",
    "remote.py",
    "root.py",
    "sdb.py",
    "sdk.py",
    "settings-ui.js",
    "settings.js",
    "signer.py",
    "startup.js",
    "weather.js"
  ],
  "enums": {
    "action": [
      "/apps",
      "/home",
      "/leave",
      "/startup",
      "/watch",
      "apply",
      "backup",
      "export",
      "home",
      "leave",
      "live_tv",
      "open",
      "restore",
      "samsung_home",
      "status",
      "watch"
    ],
    "command": [
      "apps",
      "certs",
      "debloat",
      "discover",
      "home",
      "inspect",
      "install",
      "key",
      "launch",
      "logs",
      "status",
      "uninstall"
    ],
    "method": [
      "applist",
      "capability",
      "debug_launch",
      "duid",
      "forward",
      "install",
      "launch",
      "pull",
      "push",
      "shell",
      "shell_bounded",
      "tcp_request",
      "uninstall"
    ],
    "mode": [
      "blocked",
      "hold",
      "native",
      "stock",
      "unknown",
      "watcher"
    ],
    "status": [
      "accepted",
      "confirmed",
      "failed",
      "ok",
      "unavailable",
      "unconfirmed"
    ],
    "phase": [
      "autostart",
      "boot",
      "db/appfw/booting_appid_backup",
      "db/appfw/home_appid",
      "db/appfw/startup_appid",
      "db/first_screen/type",
      "db/menu/smart_hub/ontvsetting/auto_start",
      "final",
      "home_operation"
    ],
    "component": [
      "launcher",
      "service"
    ],
    "state": [
      "acknowledged",
      "active",
      "applied",
      "blocked",
      "collected",
      "completed",
      "failed",
      "hold",
      "idle",
      "loading",
      "native",
      "not_requested",
      "partial",
      "paused",
      "pending",
      "rejected",
      "restored",
      "rolled_back",
      "stock",
      "unavailable",
      "unknown",
      "watcher"
    ],
    "storage": [
      "failed",
      "loading",
      "ready",
      "saving",
      "unavailable"
    ],
    "clock": [
      "monotonic",
      "wall_fallback"
    ],
    "arch": [
      "aarch64",
      "arm",
      "arm64",
      "armv7",
      "armv7l",
      "ia32",
      "x64",
      "x86",
      "x86_64"
    ],
    "access": [
      "sdk_uid_901",
      "temporary_root"
    ]
  }
};
  function has(list, value) { return list.indexOf(value) >= 0; }
  function finite(value) { return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 10000000000000000 ? value : null; }
  function errorCode(value) {
    var text = typeof value === 'string' ? value.slice(0, 1024).toLowerCase() : '';
    var patterns = [['cannot read', 'property_access_failed'], ['is not defined', 'reference_unavailable'],
      ['unexpected token', 'invalid_syntax'], ['launch denied', 'launch_denied'], ['launch failed', 'launch_failed']];
    for (var i = 0; i < patterns.length; i++) { if (text === patterns[i][1] || text.indexOf(patterns[i][0]) >= 0) { return patterns[i][1]; } }
    return 'detail_omitted';
  }
  function sourceFile(value) {
    if (typeof value !== 'string') { return '[unknown source]'; }
    var name = value.split(/[?#]/)[0].split(/[\\/]/).pop();
    return has(schema.source_files, name) ? name : '[unknown source]';
  }
  function stack(value) {
    if (typeof value !== 'string') { return ''; }
    return value.slice(0, 4096).split('\n').map(function (line) {
      var match = line.match(/(?:^|[\\/])([a-zA-Z0-9_-]+\.(?:js|html|py)):(\d+)(?::(\d+))?/);
      return match && has(schema.source_files, match[1]) ? match[1] + ':' + match[2] + (match[3] ? ':' + match[3] : '') : '';
    }).filter(Boolean).slice(0, 8).join('\n');
  }
  function create() {
    var aliases = Object.create(null), keys = [], serial = 0;
    var seed = ('00000000' + Math.floor(Math.random() * 4294967296).toString(16)).slice(-8);
    function alias(value, kind) {
      if (typeof value !== 'string' || value.length > 256) { return null; }
      if (kind === 'app' && /^app-[0-9]+$/.test(value) || kind !== 'app' && /^d-[a-f0-9]{8}-[0-9]+(?:-[0-9]+)?$/.test(value)) { return value; }
      var key = kind + ':' + value;
      if (!aliases[key]) {
        if (keys.length >= 512) { delete aliases[keys.shift()]; }
        aliases[key] = kind === 'app' ? 'app-' + (++serial) : 'd-' + seed + '-' + (++serial); keys.push(key);
      }
      return aliases[key];
    }
    function value(input, key) {
      if (input === null || typeof input === 'undefined') { return null; }
      if (has(schema.bools, key)) { return typeof input === 'boolean' ? input : null; }
      if (has(schema.numbers, key)) { return finite(input); }
      if (schema.enums[key]) { return has(schema.enums[key], input) ? input : null; }
      if (key === 'app_id') { return has(schema.app_ids, input) ? input : alias(input, 'app'); }
      if (key === 'id' || key === 'session' || key === 'operation_id') { return alias(input, 'ref'); }
      if (key === 'message') { return errorCode(input); }
      if (key === 'error' || key === 'error_type') { return has(schema.errors, input) ? input : 'Error'; }
      if (key === 'reason') {
        if (has(schema.reasons, input) || typeof input === 'string' && /^(?:(?:fresh )?Art status: (on|off|unknown)|HomeWatcher HTTP [1-5][0-9]{2})$/.test(input)) { return input; }
        if (typeof input === 'string' && input.indexOf('home pressed in ') === 0) { return 'home_pressed_in_app'; }
        return errorCode(input);
      }
      if (key === 'file') { return sourceFile(input); }
      if (key === 'stack') { return stack(input); }
      if (key === 'operation') { return typeof input === 'string' && /^http:\/\/tizen.org\/appcontrol\/operation\/(main|default|view|service)$/.test(input) ? input : null; }
      if (key === 'version' || key === 'tizen') { return typeof input === 'string' && /^[0-9]{1,3}(?:\.[0-9]{1,3}){1,3}$/.test(input) ? input : null; }
      if (key === 'build_id' || key === 'commit') { return typeof input === 'string' && /^[a-f0-9]{40,64}$/.test(input) ? input : null; }
      if (key === 'firmware') { return typeof input === 'string' && /^[A-Z0-9][A-Z0-9_.-]{1,127}$/.test(input) && /[0-9]/.test(input) ? input : null; }
      return null;
    }
    return {
      session: 'd-' + seed + '-0', value: value,
      event: function (name) { return has(schema.events, name) ? name : 'diagnostic.unknown'; },
      details: function (data) {
        var result = {};
        if (data && typeof data === 'object') {
          ['action', 'mode', 'operation', 'app_id', 'error', 'reason', 'status', 'phase', 'line', 'component', 'version', 'hidden', 'operation_id', 'message', 'file', 'column', 'stack', 'code', 'build_id', 'commit', 'dirty'].forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(data, key) && ['string', 'number', 'boolean'].indexOf(typeof data[key]) >= 0) { result[key] = value(data[key], key); }
          });
        }
        return result;
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = create; }
  else { root.AeroDiagnosticsPrivacy = create; }
})(typeof window !== 'undefined' ? window : this);
