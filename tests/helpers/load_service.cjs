const { readFileSync } = require("node:fs");
const path = require("node:path");
const { compileTypeScript, loadTypeScript } = require("./load_typescript.cjs");

const runtimeFile = (name) => {
  if (process.env.AEROTIZEN_TEST_SERVICE_BASELINE)
    return path.resolve(__dirname, "../fixtures/watcher-service", name + ".js");
  if (process.env.AEROTIZEN_TEST_SERVICE_BUNDLE)
    return path.resolve(__dirname, "../../dist/launcher/service", name + ".js");
  return null;
};

exports.serviceSource = (name, entry) => {
  const runtime = runtimeFile(name);
  return runtime ? readFileSync(runtime, "utf8") : compileTypeScript(entry);
};

exports.serviceFactory = (name, entry) => {
  const runtime = runtimeFile(name);
  return runtime ? require(runtime) : loadTypeScript(entry).default;
};
