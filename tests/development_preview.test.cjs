const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createAppsPlatform } = loadTypeScript("launcher/src/platform/tizen/createAppsPlatform.ts");
const { createInputsPlatform } = loadTypeScript("launcher/src/platform/tizen/createInputsPlatform.ts");
const { createAppsService } = loadTypeScript("launcher/src/services/createAppsService.ts");
const { createPreviewPlatforms } = loadTypeScript("launcher/src/dev/createPreviewPlatforms.ts");

test("missing native APIs do not manufacture app or input inventory", () => {
  const host = { AeroTizen: { tizen: null, config: {} }, document: { hidden: false } };
  let apps;
  let sources;
  createAppsPlatform(host).readInstalled((value) => {
    apps = value;
  });
  createInputsPlatform(host).read((value) => {
    sources = value;
  });
  assert.equal(apps, null);
  assert.equal(sources, null);
});

test("missing app APIs retain the real label cache and settle discovery as unavailable", () => {
  const cached = [{ id: "real.app", name: "Installed app", icon: "native.png" }];
  const config = { STORE_PACKAGE: /./, HIDDEN_APPS: /^$/, HBBTV_APP_ID: "tv", DEFAULT_HOME_APPS: [] };
  const platform = createAppsPlatform({ AeroTizen: { tizen: null, config } });
  const service = createAppsService({
    catalog: { preloadedStoreId: () => null },
    config,
    platform,
    storage: {
      getItem: () => JSON.stringify(cached),
      setItem() {
        assert.fail("unavailable discovery wrote cache");
      },
    },
  });
  service.restore();
  let result;
  service.load((success) => {
    result = success;
  });
  assert.equal(result, false);
  assert.equal(service.getSnapshot().ready, false);
  assert.deepEqual(service.getSnapshot().all, cached);
  service.dispose();
});

test("explicit preview adapters provide sample data and preserve supplied native adapters", () => {
  let enabled = true;
  const adapters = createPreviewPlatforms(() => enabled);
  const host = { AeroTizen: { tizen: null, config: {} }, document: { hidden: false } };
  const apps = createAppsPlatform(host);
  const inputs = createInputsPlatform(host);
  let records;
  let sources;
  adapters.apps(apps).readInstalled((value) => {
    records = value;
  });
  adapters.inputs(inputs).read((value) => {
    sources = value;
  });
  assert.equal(records.length, 25);
  assert.equal(records.find((app) => app.id === "demo0").name, "YouTube");
  assert.equal(sources.length, 4);
  assert.ok(Object.isFrozen(records) && Object.isFrozen(sources));
  enabled = false;
  assert.equal(adapters.apps(apps), apps);
  assert.equal(adapters.inputs(inputs), inputs);
});
