const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
if (!existsSync(path.join(root, "dist/launcher/service/index.js"))) {
  throw new Error("Run npm run build before the packaged service checks.");
}

execFileSync(
  process.execPath,
  [
    "--test",
    "tests/artmode.test.cjs",
    "tests/watcher.test.cjs",
    "tests/home_store.test.cjs",
    "tests/ip_control_probe.test.cjs",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, AEROTIZEN_TEST_SERVICE_BUNDLE: "1" } },
);
