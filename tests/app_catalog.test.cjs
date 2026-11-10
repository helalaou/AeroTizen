const { installApps } = require("./helpers/apps.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const launcher = path.join(__dirname, "../launcher");
const script = (name) => fs.readFileSync(path.join(launcher, "js", name), "utf8");

function runtime(entries) {
  const A = {},
    context = vm.createContext({ window: { AeroTizen: A } });
  vm.runInContext(script("app-catalog.js"), context);
  if (entries) A.catalog.apps = entries;
  vm.runInContext(script("app-lookup.js"), context);
  return { A };
}

test("catalogue records have unique keys and unambiguous string IDs", () => {
  const { A } = runtime();
  const keys = new Set(),
    ids = new Set();
  assert.ok(A.catalog.apps.length > 0);
  for (const entry of A.catalog.apps) {
    assert.match(entry.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!keys.has(entry.key), `Duplicate app key: ${entry.key}`);
    keys.add(entry.key);
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.name.trim());
    assert.ok(Array.isArray(entry.variants));
    assert.ok(entry.variants.length > 0, `Missing variants: ${entry.key}`);
    for (const variant of entry.variants) {
      assert.equal(typeof variant.appId, "string", `Missing app ID: ${entry.key}`);
      assert.ok(variant.appId, `Empty app ID: ${entry.key}`);
      if (variant.sideloaded === true) {
        assert.equal(variant.storeId, undefined, `Sideloaded app has a store ID: ${entry.key}`);
        assert.ok(!variant.preloaded, `Sideloaded app cannot use a store watcher ID: ${entry.key}`);
      } else {
        assert.equal(typeof variant.storeId, "string", `Missing store ID: ${entry.key}`);
        assert.ok(variant.storeId, `Empty store ID: ${entry.key}`);
      }
      for (const field of ["appId", "storeId"]) {
        if (variant[field] === undefined) continue;
        const id = variant[field];
        assert.equal(typeof id, "string", `${entry.key}.${field} must be a string`);
        assert.match(id, field === "storeId" ? /^\d+$/ : /^[A-Za-z0-9_.-]+$/);
        assert.ok(!ids.has(id), `Duplicate app/store ID: ${id}`);
        ids.add(id);
      }
      if (variant.sideloaded !== undefined) assert.equal(typeof variant.sideloaded, "boolean");
      if (variant.preloaded !== undefined) {
        assert.equal(typeof variant.preloaded, "boolean");
        assert.ok(variant.appId && variant.storeId, `Preloaded app needs both IDs: ${entry.key}`);
      }
    }
  }
});

test("catalogue keeps every original app and formerly branded entry", () => {
  const { A } = runtime();
  const context = vm.createContext({ window: { AeroTizen: {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "fixtures/legacy-launcher/js/app-catalog.js"), "utf8"), context);
  const current = new Set(A.catalog.apps.map((entry) => entry.key));
  for (const entry of context.window.AeroTizen.catalog.apps) {
    assert.ok(current.has(entry.key), `Original app was dropped: ${entry.key}`);
  }
  const keys = Array.from(A.catalog.apps, (entry) => entry.key);
  assert.deepEqual(keys, [...keys].sort());
});

test("each store identity pair resolves directly without matching the display name", () => {
  const { A } = runtime();
  for (const entry of A.catalog.apps) {
    for (const variant of entry.variants) {
      const expected = variant.storeId || null;
      assert.equal(A.catalog.storeId(variant.appId), expected, entry.key);
      assert.equal(A.catalog.artworkStoreId({ id: variant.appId, name: "Unrelated name" }), expected, entry.key);
      if (variant.storeId) {
        assert.equal(A.catalog.artworkStoreId({ id: variant.storeId, name: "Unrelated name" }), expected, entry.key);
      }
    }
  }
});

test("TizenBrew is the explicit sideloaded exception and never maps to a store", () => {
  const { A } = runtime();
  const sideloaded = A.catalog.apps.filter((entry) => entry.variants.some((variant) => variant.sideloaded));
  assert.deepEqual(
    Array.from(sideloaded, (entry) => entry.key),
    ["tizenbrew"],
  );
  const appId = "xvvl3S1bvH.TizenBrewStandalone";
  assert.equal(sideloaded[0].variants[0].appId, appId);
  assert.equal(A.catalog.storeId(appId), null);
  assert.equal(A.catalog.preloadedStoreId(appId), null);
});

test("Samsung TV Plus maps its standalone app without claiming helper or privacy apps", () => {
  const { A } = runtime();
  assert.equal(A.catalog.storeId("HEPsqFNie0.tvplusstandalone"), "3202405035480");
  for (const id of ["com.samsung.tv.tvPlusDeeplinker", "com.samsung.tv.tvplus", "w2VwCK465D.OTApp"]) {
    assert.equal(A.catalog.storeId(id), null);
    assert.equal(A.catalog.artworkStoreId({ id, name: "Samsung TV Plus Privacy Settings" }), null);
  }
});

test("catalogue stores identities and artwork aliases without fallback branding", () => {
  const { A } = runtime();
  for (const entry of A.catalog.apps) {
    assert.equal(Object.hasOwn(entry, "fallback"), false);
    assert.equal(Object.hasOwn(entry.legacy || {}, "brandPrefixes"), false);
    const aliases = entry.legacy && entry.legacy.artworkNames;
    if (!aliases) continue;
    assert.ok(Array.isArray(aliases));
    assert.ok(
      entry.variants.some((variant) => variant.storeId),
      `Artwork rule needs store ID: ${entry.key}`,
    );
    for (const alias of aliases) {
      assert.equal(typeof alias, "string");
      assert.ok(alias && alias === alias.toLowerCase());
    }
  }
});

test("verified app and store IDs select the same record despite renamed or conflicting names", () => {
  const { A } = runtime();
  for (const id of ["IkWsFHtOY9.Stremio", "3202306031311"]) {
    const app = { id, name: "YouTube" };
    assert.equal(A.catalog.artworkStoreId(app), "3202306031311");
  }
  assert.equal(A.catalog.artworkStoreId({ id: "DqEoaplKlw.bbchybrid", name: "Renamed app" }), "3201601007670");
});

test("artwork aliases match complete names and preserve legacy title cleanup", () => {
  const { A } = runtime();
  const app = { id: "unknown.app", name: "YouTube TV" };
  assert.equal(A.catalog.artworkStoreId(app), null);
  assert.equal(A.catalog.artworkStoreId({ id: "unknown.app", name: "Amazon Prime Video" }), "3201910019365");
  assert.equal(A.catalog.artworkStoreId({ id: "unknown.app", name: " ITVX - fresh, free streaming." }), "121299000089");
});

test("each app variant retains its paired store ID", () => {
  const { A } = runtime([
    {
      key: "example",
      name: "Example",
      variants: [
        { appId: "example.first", storeId: "123" },
        { appId: "example.second", storeId: "456" },
      ],
    },
  ]);
  assert.equal(A.catalog.artworkStoreId({ id: "example.first" }), "123");
  assert.equal(A.catalog.artworkStoreId({ id: "example.second" }), "456");
  assert.equal(A.catalog.artworkStoreId({ id: "456" }), "456");
});

test("HBO Max variants retain both verified app and store ID pairs", () => {
  const { A } = runtime();
  for (const [id, storeId] of [
    ["5b8c3eb16b.BeamCTVDev", "3202301029760"],
    ["fjpfQryJuR.HBOMaxCTV", "3202311033168"],
  ]) {
    assert.equal(A.catalog.storeId(id), storeId);
    assert.equal(A.catalog.artworkStoreId({ id, name: "Renamed app" }), storeId);
  }
});

test("unknown IDs remain unknown and preloaded mappings do not use name aliases", () => {
  const { A } = runtime();
  for (const id of ["unknown.app", "constructor", "__proto__"]) {
    assert.equal(A.catalog.artworkStoreId({ id, name: "Unknown" }), null);
    assert.equal(A.catalog.preloadedStoreId(id), null);
  }
  assert.equal(A.catalog.preloadedStoreId("org.tizen.netflix-app"), "3201907018807");
  assert.equal(A.catalog.preloadedStoreId("org.tizen.primevideo"), "3201910019365");
  assert.equal(A.catalog.preloadedStoreId("netflix"), null);
  // On a QN80H (Tizen 10), :8001 reports YouTube visible only under its store ID.
  assert.equal(A.catalog.preloadedStoreId("9Ur5IzDKqV.TizenYouTube"), "111299001912");
  assert.equal(A.catalog.preloadedStoreId("MCmYXNxgcu.DisneyPlus"), "3201901017640");
  assert.equal(A.catalog.preloadedStoreId("fjpfQryJuR.HBOMaxCTV"), "3202311033168");
});

test("preloaded Apple TV resolves artwork by its verified ID", () => {
  const { A } = runtime();
  assert.equal(A.catalog.preloadedStoreId("com.samsung.tv.aria-video"), "3201807016597");
  for (const id of ["com.samsung.tv.aria-video", "3201807016597"]) {
    const app = { id, name: "YouTube" };
    assert.equal(A.catalog.artworkStoreId(app), "3201807016597");
  }
});

test("preloaded Apple TV passes discovery and uses its store ID in the watcher inventory", () => {
  const { A } = runtime();
  const appleTV = {
    id: "com.samsung.tv.aria-video",
    packageId: "com.samsung.tv.aria-video",
    name: "Apple TV",
    iconPath: "apple-tv.png",
    show: true,
  };
  const installed = [appleTV, { id: "unrelated.native", packageId: "unrelated.native", name: "Apple TV", show: true }];
  A.tizen = {
    application: {
      getAppsInfo(done) {
        done(installed);
      },
    },
  };
  const context = vm.createContext({ window: { AeroTizen: A }, AeroTizen: A });
  vm.runInContext(script("config.js"), context);
  installApps(context);
  assert.equal(A.config.STORE_PACKAGE.test(appleTV.packageId), false);
  let loaded = false;
  A.apps.load(() => {
    loaded = true;
  });
  assert.equal(loaded, true);
  assert.deepEqual(
    Array.from(A.apps.getSnapshot().all, (app) => ({ ...app })),
    [{ id: appleTV.id, name: "Apple TV", icon: "apple-tv.png" }],
  );
  assert.deepEqual(Array.from(A.apps.getSnapshot().realIds), ["3201807016597"]);

  appleTV.show = false;
  A.apps.load(() => {});
  assert.equal(A.apps.getSnapshot().all.length, 0);
  assert.equal(A.apps.getSnapshot().realIds.length, 0);
});

test("watcher requests keep the preloaded store IDs from the shared catalogue", () => {
  const requests = [],
    A = { tizen: {} };
  class Request {
    open(method, url) {
      requests.push({ method, url });
    }
    send() {}
  }
  const context = vm.createContext({
    window: { AeroTizen: A },
    AeroTizen: A,
    XMLHttpRequest: Request,
    document: { addEventListener() {} },
  });
  for (const name of ["config.js", "app-catalog.js", "app-lookup.js", "homewatch.js"]) {
    vm.runInContext(script(name), context);
  }
  A.homewatch.watch("org.tizen.netflix-app");
  A.homewatch.watch("org.tizen.primevideo");
  A.homewatch.watch("com.samsung.tv.aria-video");
  A.homewatch.watch("normal.app");
  assert.deepEqual(requests, [
    { method: "GET", url: "http://127.0.0.1:47790/watch?id=3201907018807" },
    { method: "GET", url: "http://127.0.0.1:47790/watch?id=3201910019365" },
    { method: "GET", url: "http://127.0.0.1:47790/watch?id=3201807016597" },
    { method: "GET", url: "http://127.0.0.1:47790/watch?id=normal.app" },
  ]);
});
