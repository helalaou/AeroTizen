const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "../launcher");

function runtime(tv = false) {
  const A = { tizen: tv ? {} : null };
  const context = vm.createContext({
    window: { AeroTizen: A },
    AeroTizen: A,
  });
  for (const file of ["config.js", "app-catalog.js", "app-lookup.js", "artwork.js", "brands.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
  }
  return { A };
}

test("browser previews use app names without requesting TV artwork", () => {
  const { A } = runtime();
  assert.deepEqual(Array.from(A.artwork.sources({ id: "demo", name: "ITVX - fresh, free streaming." })), []);
  assert.deepEqual(
    Array.from(
      A.artwork.sources({
        id: "111299001912",
        name: "YouTube",
        icon: "/opt/share/webappservice/apps_icon/all/111299001912/304x304.png",
      }),
    ),
    [],
  );
});

test("TV artwork matches stable app IDs even when a display name changes", () => {
  const { A } = runtime(true);
  const sources = Array.from(A.artwork.sources({ id: "DqEoaplKlw.bbchybrid", name: "Renamed app" }));
  assert.deepEqual(sources, [
    "/opt/share/webappservice/apps_icon/all/3201601007670/304x304.png",
    "/opt/share/webappservice/apps_icon/FirstScreen/3201601007670/250x250.png",
  ]);
  assert.equal(
    A.artwork.sources({ id: "IkWsFHtOY9.Stremio", name: "YouTube" })[0],
    "/opt/share/webappservice/apps_icon/all/3202306031311/304x304.png",
  );
  assert.deepEqual(Array.from(A.artwork.sources({ id: "../../unrelated", name: "Unknown" })), []);
  assert.deepEqual(Array.from(A.artwork.sources({ id: "other", name: "UFO" })), []);
  assert.deepEqual(Array.from(A.artwork.sources({ id: "other", name: "YouTube TV" })), []);
});

test("uncatalogued apps use TV-provided store IDs and only local Samsung files", () => {
  const { A } = runtime(true);
  assert.deepEqual(Array.from(A.artwork.sources({ id: "unknown.app", storeId: "123456", name: "Unknown app" })), [
    "/opt/share/webappservice/apps_icon/all/123456/304x304.png",
    "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png",
  ]);
  assert.deepEqual(Array.from(A.artwork.sources({ id: "unknown.app", storeId: "../../bad", name: "Unknown app" })), []);
});

test("a TV-provided store ID takes precedence over model-specific catalogue IDs", () => {
  const { A } = runtime(true);
  const fromCache = A.artwork.sources({
    id: "native",
    name: "Samsung TV Plus",
    icon: "/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png",
  });
  assert.equal(fromCache[0], "/opt/share/webappservice/apps_icon/all/123456/304x304.png");
  assert.equal(fromCache.length, 2);
  assert.equal(
    A.artwork.sources({ id: "789012", name: "Samsung TV Plus" })[0],
    "/opt/share/webappservice/apps_icon/all/789012/304x304.png",
  );
  assert.equal(
    A.artwork.sources({ id: "native", name: "Samsung TV Plus", storeId: "987654" })[0],
    "/opt/share/webappservice/apps_icon/all/987654/304x304.png",
  );
});

test("Settings can read titles and artwork data without creating DOM nodes or image timers", () => {
  const { A } = runtime(true);
  const known = A.tiles.describe({ id: "111299001912", name: "YouTube" });
  assert.equal(known.title, "YouTube");
  assert.deepEqual(Object.keys(known).sort(), ["appIcon", "artwork", "title"]);
  assert.equal(known.appIcon, "");
  assert.equal(known.artwork.length, 2);
  const unknown = A.tiles.describe({
    id: "unknown",
    name: "Unknown app - example",
    icon: "local/icon.png",
  });
  assert.equal(unknown.title, "Unknown app");
  assert.equal(unknown.appIcon, "local/icon.png");
  assert.deepEqual(Array.from(unknown.artwork), ["local/icon.png"]);
});

test("TV-installed icons are artwork candidates for known and unknown apps", () => {
  const { A } = runtime(true);
  assert.deepEqual(Array.from(A.artwork.sources({ id: "unknown.app", name: "Unknown", icon: "local/icon.png" })), [
    "local/icon.png",
  ]);
  const known = Array.from(A.artwork.sources({ id: "111299001912", name: "YouTube", icon: "local/youtube.png" }));
  assert.equal(known[2], "local/youtube.png");
  const cached = "/opt/share/webappservice/apps_icon/all/111299001912/304x304.png";
  assert.equal(A.artwork.sources({ id: "111299001912", name: "YouTube", icon: cached }).length, 2);
  assert.equal(A.artwork.packageIcon({ icon: cached }), "");
  assert.equal(A.artwork.packageIcon({ icon: "local/icon.png" }), "local/icon.png");
});
