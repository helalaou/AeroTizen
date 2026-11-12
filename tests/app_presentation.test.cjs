const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { appCatalog, createAppCatalog } = loadTypeScript("launcher/src/shared/apps/appCatalog.ts");
const { describeApp } = loadTypeScript("launcher/src/shared/apps/appPresentation.ts");
const { shortAppName } = loadTypeScript("launcher/src/shared/apps/appNames.ts");

test("catalogue variants resolve their paired IDs and only preloaded apps map to the watcher", () => {
  for (const entry of appCatalog.apps) {
    for (const variant of entry.variants) {
      assert.equal(appCatalog.storeId(variant.appId), variant.storeId ?? null, entry.key);
      assert.equal(appCatalog.preloadedStoreId(variant.appId), variant.preloaded ? variant.storeId : null, entry.key);
      if (variant.storeId) {
        assert.equal(appCatalog.storeId(variant.storeId), variant.storeId, entry.key);
        assert.equal(
          appCatalog.artworkStoreId(Object.freeze({ id: variant.storeId, name: "Renamed app" })),
          variant.storeId,
          entry.key,
        );
      }
    }
    for (const alias of entry.legacy?.artworkNames ?? []) {
      const app = Object.freeze({ id: "unknown.app", name: alias.toUpperCase() + " - extra details" });
      assert.equal(appCatalog.artworkStoreId(app), entry.variants[0].storeId ?? null, alias);
    }
  }
  for (const id of ["unknown.app", "constructor", "__proto__"]) {
    assert.equal(appCatalog.storeId(id), null);
    assert.equal(appCatalog.preloadedStoreId(id), null);
  }
});

for (const { name, app, title, artwork, appIcon } of [
  {
    name: "verified identity wins over a conflicting name",
    app: { id: "111299001912", name: "Renamed app - extra details", icon: "installed.png" },
    title: "Renamed app",
    artwork: [
      "/opt/share/webappservice/apps_icon/all/111299001912/304x304.png",
      "/opt/share/webappservice/apps_icon/FirstScreen/111299001912/250x250.png",
      "installed.png",
    ],
    appIcon: "installed.png",
  },
  {
    name: "TV-provided store ID wins over the catalogue and cache path",
    app: {
      id: "111299001912",
      name: "YouTube",
      storeId: "987654",
      icon: "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png",
    },
    title: "YouTube",
    artwork: [
      "/opt/share/webappservice/apps_icon/all/987654/304x304.png",
      "/opt/share/webappservice/apps_icon/FirstScreen/987654/250x250.png",
      "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png",
    ],
    appIcon: "",
  },
  {
    name: "cache paths identify an otherwise unknown app without duplicating an image",
    app: { id: "native", name: "Unknown", icon: "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png" },
    title: "Unknown",
    artwork: [
      "/opt/share/webappservice/apps_icon/all/123456/304x304.png",
      "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png",
    ],
    appIcon: "",
  },
  {
    name: "invalid store IDs cannot construct cache paths",
    app: { id: "unknown.app", name: "Unknown", storeId: "../../bad", icon: "installed.png" },
    title: "Unknown",
    artwork: ["installed.png"],
    appIcon: "installed.png",
  },
  {
    name: "missing artwork keeps a name",
    app: { id: "unknown.app", name: "Unknown", icon: "" },
    title: "Unknown",
    artwork: [],
    appIcon: "",
  },
]) {
  for (const tv of [false, true]) {
    test(`app presentation: ${name} (${tv ? "TV" : "browser"})`, () => {
      const input = Object.freeze(app);
      assert.deepEqual(describeApp(input, { tv }), { title, artwork: tv ? artwork : [], appIcon });
    });
  }
}

for (const [name, expected] of [
  ["", ""],
  [" ITVX - streaming", " ITVX"],
  ["TizenBrewNextGeneration", "TizenBrew"],
  ["nextgeneration", "nextgeneration"],
  ["App - first - second", "App"],
]) {
  test(`short app name: ${JSON.stringify(name)}`, () => assert.equal(shortAppName(name), expected));
}

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
});
