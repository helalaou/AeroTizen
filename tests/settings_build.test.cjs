const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("acorn");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist/launcher");
const read = (base, file) => readFileSync(path.join(base, file), "utf8");
execFileSync(process.execPath, ["tools/build-launcher.mjs"], { cwd: root });

test("compiled launcher uses the production page, local scripts and the Preact license", () => {
  const html = read(output, "index.html");
  assert.equal(
    html,
    read(path.join(root, "launcher"), "index.html"),
    "production markup is not rewritten at build time",
  );
  assert.match(html, /<div id="home-root"><\/div>/);
  assert.match(html, /<div id="background-root"><\/div>/);
  assert.match(html, /<div id="settings-root"><\/div>/);
  assert.match(html, /<div id="fireplace-root"><\/div>/);
  assert.match(html, /<div id="weather-photo-root" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html, /type="module"|https?:[^"']+\.js|@vite\/client|\/src\//);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(scripts.includes("js/launcher-ui.js"));
  assert.ok(!scripts.includes("js/settings.js"), "settings are owned by the TypeScript service");
  assert.ok(!scripts.includes("js/weather.js"), "weather is owned by the TypeScript service");
  assert.ok(!scripts.includes("js/continue-watching.js"), "Continue Watching is owned by the TypeScript service");
  assert.ok(!scripts.includes("js/samsung-continue.js"), "the Samsung provider is created by typed app composition");
  assert.ok(!scripts.includes("js/stremio-continue.js"), "the Stremio provider is created by typed app composition");
  assert.ok(!scripts.includes("js/native-navigation.js"), "native navigation is owned by the typed adapter");
  assert.ok(!scripts.includes("js/apps.js"), "apps are owned by the TypeScript service");
  assert.ok(!scripts.includes("js/inputs.js"), "inputs are owned by the TypeScript service");
  for (const file of ["app-catalog.js", "app-lookup.js", "artwork.js", "brands.js", "homewatch.js"]) {
    assert.ok(!scripts.includes("js/" + file), "app identity and presentation use typed imports");
    assert.equal(existsSync(path.join(output, "js", file)), false, file);
  }
  assert.ok(!scripts.includes("js/network.js"), "network status is owned by the TypeScript service");
  assert.ok(
    scripts.indexOf("js/launcher-diagnostics.js") < scripts.indexOf("js/launcher-ui.js"),
    "diagnostics run before the UI",
  );
  for (const file of [
    "js/config.js",
    "js/dom.js",
    "js/main.js",
    "js/startup.js",
    "js/diagnostics.js",
    "js/diagnostics-storage.js",
    "js/diagnostics-privacy.js",
  ]) {
    assert.ok(!scripts.includes(file), `${file} is replaced by the shared TypeScript entry`);
    assert.equal(existsSync(path.join(output, file)), false);
  }
  for (const file of scripts) {
    assert.ok(existsSync(path.join(output, file)), file);
    parse(read(output, file), { ecmaVersion: 2018, sourceType: "script" });
  }
  const stylesheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(stylesheets.includes("js/launcher-ui.css"), "the TV page loads the compiled component styles");
  for (const file of stylesheets) assert.ok(existsSync(path.join(output, file)), file);
  const componentStyles = read(output, "js/launcher-ui.css");
  assert.match(componentStyles, /var\(--choice-selected-surface\)/);
  assert.match(componentStyles, /data-focused/);
  assert.doesNotMatch(
    componentStyles,
    /#editor|:global\(|:is\(|:where\(|@layer\b|\binset:/,
    "component styles have no editor dependency or unsupported Chromium 69 selectors",
  );
  assert.equal(existsSync(path.join(output, "src")), false, "TypeScript source is not a TV runtime asset");
  assert.doesNotMatch(read(output, "js/launcher-ui.js"), /@vite\/client|@prefresh|preact\/debug/);
  assert.doesNotMatch(
    read(output, "js/launcher-ui.js"),
    /After the Tide|A Quiet Orbit|Preview001|demo0|continue\.demoFeed|continue\.demoPlayback/,
    "sample inventory, programmes and preview-only copy cannot enter the TV bundle",
  );
  assert.match(read(output, "licenses/preact.txt"), /MIT License/);
  assert.equal(read(output, "licenses/i18next.txt"), read(path.join(root, "node_modules/i18next"), "LICENSE"));
  assert.equal(
    read(output, "licenses/lucide-preact.txt"),
    read(path.join(root, "node_modules/lucide-preact"), "LICENSE"),
  );
  assert.match(read(output, "licenses/lucide-preact.txt"), /ISC License/);
  assert.match(
    read(output, "licenses/lucide-preact.txt"),
    /The MIT License.*Feather|The MIT License.*icons listed above/,
  );
});

test("compilation preserves runtime scripts, CSS, service and app identity", () => {
  assert.deepEqual(
    readdirSync(path.join(output, "js")).sort(),
    ["build-info.js", "launcher-ui.js", "launcher-ui.css", "launcher-diagnostics.js"].sort(),
  );
  for (const file of readdirSync(path.join(root, "launcher/css"))) {
    assert.equal(read(output, `css/${file}`), read(path.join(root, "launcher"), `css/${file}`));
  }
  for (const [, font] of read(output, "css/fonts.css").matchAll(/url\("\.\.\/(fonts\/[^"]+)"\)/g)) {
    assert.ok(existsSync(path.join(output, font)), font);
    assert.match(read(output, path.posix.join(path.posix.dirname(font), "OFL.txt")), /SIL OPEN FONT LICENSE/);
  }
  assert.deepEqual(readdirSync(path.join(output, "service")).sort(), [
    "artmode.js",
    "diagnostics-context.js",
    "diagnostics-store.js",
    "diagnostics.js",
    "home-mode.js",
    "home-store.js",
    "index.js",
    "ip-control.js",
  ]);
  for (const file of readdirSync(path.join(output, "service"))) {
    parse(read(output, "service/" + file), { ecmaVersion: 5, sourceType: "script" });
  }
  assert.equal(read(output, "config.xml"), read(path.join(root, "launcher"), "config.xml"));
  parse(read(output, "service/diagnostics.js"), { ecmaVersion: 5, sourceType: "script" });
  const { createDiagnostics } = require(path.join(output, "service/diagnostics.js"));
  const logger = createDiagnostics("service");
  logger.record("service.start");
  assert.equal(logger.snapshot().records[0].event, "service.start");
  const serviceModule = { exports: {} };
  vm.runInNewContext(read(output, "service/diagnostics.js"), {
    module: serviceModule,
    exports: serviceModule.exports,
    Symbol: undefined,
    Map: undefined,
    Set: undefined,
    Promise: undefined,
    performance: undefined,
    process: { hrtime: () => [1, 0] },
    setTimeout: () => 1,
  });
  const legacyLogger = serviceModule.exports.createDiagnostics("service");
  legacyLogger.record("service.start");
  assert.equal(legacyLogger.snapshot().records[0].event, "service.start");
  assert.equal(legacyLogger.health().clock, "monotonic");
  const context = require(path.join(output, "service/diagnostics-context.js"))({
    read: (done) => done(null, "VERSION_ID=9.0.0\nBUILD_ID=T-TEST-0090"),
  });
  context.start();
  context.accept({ health: { session: "private-session" } });
  const metadata = context.enrich({}, {}, { guard: {} });
  assert.equal(metadata.environment.tizen, "9.0.0");
  assert.match(metadata.ui.health.session, /^d-[a-f0-9]{8}-[0-9]+$/);
});

test("compiled diagnostics helpers retain CommonJS factories without modern service globals", () => {
  const imports = {
    fs: {
      stat: (name, done) => {
        assert.equal(name, "/etc/os-release");
        done(null, { size: 16385 });
      },
      readFile: () => assert.fail("oversized metadata must not be read"),
    },
    "./diagnostics": require(path.join(output, "service/diagnostics.js")),
  };
  const load = (file) => {
    const code = read(output, "service/" + file);
    parse(code, { ecmaVersion: 5, sourceType: "script" });
    const module = { exports: {} };
    vm.runInNewContext("Object.assign = undefined;\n" + code, {
      module,
      exports: module.exports,
      Buffer,
      process: undefined,
      Symbol: undefined,
      Map: undefined,
      Set: undefined,
      Promise: undefined,
      require: (name) => {
        if (name === "../js/build-info") throw new Error("Build metadata missing");
        assert.ok(Object.hasOwn(imports, name), name);
        return imports[name];
      },
    });
    assert.equal(typeof module.exports, "function");
    return module.exports;
  };
  const context = load("diagnostics-context.js")();
  context.start();
  context.accept({ health: { session: "private-session" } });
  const metadata = context.enrich({}, {}, { guard: {} });
  assert.equal(metadata.environment.state, "unavailable");
  assert.equal(metadata.environment.arch, null);
  assert.equal(metadata.environment.reason, "os_release_unavailable");
  assert.equal(metadata.build.version, null);
  assert.match(metadata.ui.health.session, /^d-[a-f0-9]{8}-[0-9]+$/);
  const openStorage = load("diagnostics-store.js");
  openStorage(null, (store) => assert.equal(store, null));
  let saved = false;
  imports.fs.writeFile = (name, value, options, done) => {
    assert.equal(name, "/private/aerotizen-diagnostics-v1.json.tmp");
    assert.equal(value, "[]");
    assert.equal(options.mode, 0o600);
    done(null);
  };
  imports.fs.rename = (from, to, done) => {
    assert.equal(to, "/private/aerotizen-diagnostics-v1.json");
    done(null);
  };
  openStorage({ filesystem: { resolve: (name, done) => done({ toURI: () => "file:///private" }) } }, (store) => {
    store.save("[]", (error) => {
      assert.equal(error, null);
      saved = true;
    });
  });
  assert.equal(saved, true);
});

test("the generated service keeps Tizen lifecycle exports and optional diagnostics", () => {
  const module = { exports: {} };
  const requests = [];
  const listeners = [];
  const intervals = new Set();
  let closed = 0;
  const http = {
    get: (options) => {
      requests.push(options);
      return { on() {}, destroy() {} };
    },
    createServer: () => ({
      listen: (port, host) => listeners.push({ port, host }),
      close: () => closed++,
    }),
  };
  vm.runInNewContext(read(output, "service/index.js"), {
    module,
    exports: module.exports,
    Symbol: undefined,
    Map: undefined,
    Set: undefined,
    Promise: undefined,
    performance: undefined,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (fn) => {
      intervals.add(fn);
      return fn;
    },
    clearInterval: (fn) => intervals.delete(fn),
    require: (name) => {
      if (name === "http") return http;
      if (["./artmode", "./home-mode", "./home-store"].includes(name))
        return require(path.join(output, "service", name));
      throw new Error("Optional diagnostics are unavailable");
    },
  });
  const api = module.exports;
  assert.deepEqual(Object.keys(api).sort(), ["onExit", "onRequest", "onStart"]);
  assert.equal(requests.length, 0);
  api.onStart();
  api.onStart();
  api.onRequest();
  assert.deepEqual(listeners, [{ port: 47790, host: "127.0.0.1" }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/v2/");
  assert.equal(intervals.size, 1);
  api.onExit();
  api.onExit();
  assert.equal(intervals.size, 0);
  assert.equal(closed, 1);
});

test("retired standalone scripts cannot enter the compiled runtime", () => {
  for (const file of [
    "settings-ui.js",
    "settings.js",
    "home-screen.js",
    "continue-row.js",
    "continue-watching.js",
    "samsung-continue.js",
    "stremio-continue.js",
    "native-navigation.js",
    "apps.js",
    "clock.js",
    "weather.js",
    "clock-layouts.js",
    "inputs-view.js",
    "inputs.js",
    "status-view.js",
    "brands-view.js",
    "logos.js",
    "wave-background.js",
    "backgrounds.js",
    "toast.js",
    "photo-weather.js",
    "fireplace.js",
  ]) {
    assert.equal(existsSync(path.join(root, "launcher/js", file)), false, file);
    assert.equal(existsSync(path.join(output, "js", file)), false, file);
  }
  assert.equal(existsSync(path.join(output, "tests")), false);
});

test("shipped UI and service share a content build identity without local paths", () => {
  const code = read(output, "js/build-info.js");
  parse(code, { ecmaVersion: 5, sourceType: "script" });
  const info = require(path.join(output, "js/build-info.js"));
  const browser = {};
  vm.runInNewContext(code, { window: browser });
  assert.deepEqual(JSON.parse(JSON.stringify(browser.AeroBuildInfo)), info);
  assert.match(info.build_id, /^[a-f0-9]{64}$/);
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.match(info.commit, /^[a-f0-9]{40,64}$/);
  assert.equal(typeof info.dirty, "boolean");
  assert.deepEqual(Object.keys(info).sort(), ["build_id", "commit", "dirty", "version"]);
  assert.ok(
    read(output, "index.html").indexOf("js/build-info.js") <
      read(output, "index.html").indexOf("js/launcher-diagnostics.js"),
  );
});

test("TV bundle includes only the selected Lucide icons", () => {
  const audit = JSON.parse(read(path.join(root, "dist"), "launcher-icons.json"));
  assert.equal(audit.package, "lucide-preact");
  assert.equal(audit.version, JSON.parse(read(path.join(root, "node_modules/lucide-preact"), "package.json")).version);
  assert.ok(audit.available > 1000);
  assert.ok(audit.rendered.length > 0 && audit.rendered.length < 100, "the full icon catalogue must not ship");
  assert.ok(audit.rendered.includes("settings"));
  assert.ok(audit.rendered.includes("hdmi-port"));
  assert.ok(!audit.rendered.includes("a-arrow-down"), "unused icons are removed");
});

test("production includes the IP Control service and excludes the missing-input browser mock", () => {
  assert.ok(existsSync(path.join(output, "service/ip-control.js")));
  const bundle = read(output, "js/launcher-ui.js");
  assert.match(bundle, /AeroTizen\.IpControlProbeReply/);
  assert.doesNotMatch(bundle, /missingHdmiPort|notifyInput/);
  assert.match(read(output, "service/index.js"), /ip-control/);
});
