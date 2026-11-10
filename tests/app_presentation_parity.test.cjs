const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { appCatalog, createAppCatalog } = loadTypeScript("launcher/src/shared/apps/appCatalog.ts");
const { artworkSources, packageIcon } = loadTypeScript("launcher/src/shared/apps/appArtwork.ts");
const { describeApp } = loadTypeScript("launcher/src/shared/apps/appPresentation.ts");
const { shortAppName } = loadTypeScript("launcher/src/shared/apps/appNames.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

function legacy(tv, entries) {
  const A = { tizen: tv ? {} : null };
  const context = vm.createContext({ window: { AeroTizen: A } });
  for (const name of ["app-catalog.js", "app-lookup.js", "artwork.js", "brands.js"]) {
    if (name === "app-lookup.js" && entries) A.catalog.apps = entries;
    vm.runInContext(fs.readFileSync(path.join(__dirname, "fixtures/app-presentation/js", name), "utf8"), context);
  }
  return A;
}

const examples = () => {
  const result = [];
  for (const entry of appCatalog.apps) {
    for (const variant of entry.variants) {
      for (const id of [variant.appId, variant.storeId].filter(Boolean)) {
        result.push({ id, name: entry.name, icon: "/opt/usr/apps/example/shared/res/icon.png" });
        result.push({ id, name: "YouTube", icon: "" });
        result.push({ id, name: "Renamed app", storeId: "987654", icon: "installed.png" });
      }
    }
    for (const name of entry.legacy?.artworkNames || []) {
      result.push({ id: "unknown.app", name: name.toUpperCase() + " - extra details" });
    }
  }
  result.push(
    { id: "unknown.app", name: "YouTube TV" },
    { id: "constructor", name: "Unknown" },
    { id: "__proto__", name: "Unknown" },
    { id: "native", name: "Renamed app", icon: "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png" },
    { id: "111299001912", name: "YouTube", icon: "/opt/share/webappservice/apps_icon/all/111299001912/304x304.png" },
    { id: "unknown.app", name: "Unknown", storeId: "../../bad", icon: "installed.png" },
    { id: "unknown.app", name: "Unknown", icon: "" },
  );
  return result.map((app) => Object.freeze(app));
};

test("catalogue data is unchanged from the merged JavaScript baseline", () => {
  assert.deepEqual(plain(appCatalog.apps), plain(legacy(true).catalog.apps));
});

test("typed catalogue lookups preserve direct IDs, aliases and preloaded watcher mappings", () => {
  const old = legacy(true).catalog;
  for (const app of examples()) {
    assert.equal(appCatalog.storeId(app.id), old.storeId(app.id), app.id);
    assert.equal(appCatalog.preloadedStoreId(app.id), old.preloadedStoreId(app.id), app.id);
    assert.equal(appCatalog.artworkStoreId(app), old.artworkStoreId(app), JSON.stringify(app));
  }
});

test("typed artwork and presentation preserve image order and names in TV and browser modes", () => {
  for (const tv of [false, true]) {
    const old = legacy(tv);
    for (const app of examples()) {
      assert.deepEqual(artworkSources(app, { tv }), plain(old.artwork.sources(app)), JSON.stringify(app));
      assert.equal(packageIcon(app), old.artwork.packageIcon(app));
      assert.deepEqual(describeApp(app, { tv }), plain(old.tiles.describe(app)), JSON.stringify(app));
    }
    for (const name of ["", " ITVX - streaming", "TizenBrewNextGeneration", "nextgeneration", "App - first - second"]) {
      assert.equal(shortAppName(name), old.tiles.shortName(name), name);
    }
  }
});

test("catalogue indexing accepts readonly inputs and preserves first alias and ID priority", () => {
  const entries = Object.freeze([
    Object.freeze({
      key: "sideloaded",
      name: "Sideloaded",
      variants: Object.freeze([Object.freeze({ appId: "side.app", sideloaded: true })]),
    }),
    Object.freeze({
      key: "first",
      name: "First",
      variants: Object.freeze([Object.freeze({ appId: "first.app", storeId: "123" })]),
      legacy: Object.freeze({ artworkNames: Object.freeze(["shared"]) }),
    }),
    Object.freeze({
      key: "second",
      name: "Second",
      variants: Object.freeze([Object.freeze({ appId: "second.app", storeId: "456" })]),
      legacy: Object.freeze({ artworkNames: Object.freeze(["shared"]) }),
    }),
  ]);
  const catalog = createAppCatalog(entries);
  assert.equal(catalog.apps, entries);
  assert.equal(catalog.artworkStoreId({ id: "unknown", name: "Shared" }), "123");
  assert.equal(catalog.artworkStoreId({ id: "second.app", name: "Shared" }), "456");
  assert.equal(catalog.artworkStoreId({ id: "side.app", name: "Shared" }), null);
  assert.deepEqual(plain(catalog.apps), plain(legacy(true, entries).catalog.apps));
});
