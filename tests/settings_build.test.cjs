const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const path = require("node:path");
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
  assert.match(html, /<div id="settings-root"><\/div>/);
  assert.doesNotMatch(html, /type="module"|https?:[^"']+\.js|@vite\/client|\/src\//);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(scripts.includes("js/launcher-ui.js"));
  assert.ok(scripts.indexOf("js/launcher-ui.js") < scripts.indexOf("js/main.js"), "views mount before boot");
  for (const file of scripts) {
    assert.ok(existsSync(path.join(output, file)), file);
    parse(read(output, file), { ecmaVersion: 2018, sourceType: "script" });
  }
  assert.equal(existsSync(path.join(output, "src")), false, "TypeScript source is not a TV runtime asset");
  assert.doesNotMatch(read(output, "js/launcher-ui.js"), /@vite\/client|@prefresh|preact\/debug/);
  assert.match(read(output, "licenses/preact.txt"), /MIT License/);
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
    [...readdirSync(path.join(root, "launcher/js")), "launcher-ui.js"].sort(),
  );
  for (const directory of ["js", "css", "service"]) {
    for (const file of readdirSync(path.join(root, "launcher", directory))) {
      if (directory === "js" && file === "build-info.js") {
        continue;
      }
      assert.equal(read(output, `${directory}/${file}`), read(path.join(root, "launcher"), `${directory}/${file}`));
    }
  }
  assert.equal(read(output, "config.xml"), read(path.join(root, "launcher"), "config.xml"));
});

test("legacy views remain test fixtures and cannot enter the compiled runtime", () => {
  for (const file of [
    "settings-ui.js",
    "home-screen.js",
    "continue-row.js",
    "clock-layouts.js",
    "inputs-view.js",
    "status-view.js",
    "brands-view.js",
    "wave-background.js",
    "backgrounds.js",
  ]) {
    assert.ok(existsSync(path.join(root, "tests/fixtures/legacy-launcher/js", file)), file);
    assert.equal(existsSync(path.join(root, "launcher/js", file)), false, file);
    assert.equal(existsSync(path.join(output, "js", file)), false, file);
  }
  assert.equal(existsSync(path.join(output, "tests")), false);
});

test("shipped UI and service share a content build identity without local paths", () => {
  const info = require(path.join(output, "js/build-info.js"));
  assert.match(info.build_id, /^[a-f0-9]{64}$/);
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.match(info.commit, /^[a-f0-9]{40,64}$/);
  assert.equal(typeof info.dirty, "boolean");
  assert.deepEqual(Object.keys(info).sort(), ["build_id", "commit", "dirty", "version"]);
  assert.ok(
    read(output, "index.html").indexOf("js/build-info.js") < read(output, "index.html").indexOf("js/diagnostics.js"),
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
  assert.ok(Buffer.byteLength(read(output, "js/launcher-ui.js")) < 160 * 1024, "reject accidental catalogue bundling");
});
