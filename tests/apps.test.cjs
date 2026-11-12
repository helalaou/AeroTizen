const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createAppsService } = loadTypeScript("launcher/src/services/createAppsService.ts");
const { createAppsPlatform } = loadTypeScript("launcher/src/platform/tizen/createAppsPlatform.ts");
const { createPreviewPlatforms } = loadTypeScript("launcher/src/dev/createPreviewPlatforms.ts");

const config = {
  DEFAULT_HOME_APPS: ["youtube", "video"],
  FIREPLACE_ID: "__fire",
  FIREPLACE_VIDEO: "fire-video",
  HBBTV_APP_ID: "hbbtv.host",
  HBBTV_LINK_METADATA: "hbbtv.link",
  HIDDEN_APPS: /service|launcher/i,
  STORE_APP_IDS: ["store.one", "store.two"],
  STORE_PACKAGE: /^[a-z0-9]{10}$/i,
};
const first = { id: "youtube", name: "YouTube", packageId: "abcdefghij", iconPath: "youtube.png" };
const second = { id: "video", name: "Video", packageId: "klmnopqrst", iconPath: "video.png" };

function harness(options = {}) {
  const data = new Map(Object.entries(options.cache === undefined ? {} : { "aerotizen.apps.v1": options.cache }));
  const requests = [];
  const launches = [];
  const calls = { dispose: 0, store: 0, fireplace: [] };
  const platform = {
    cacheInventory: !options.preview,
    readInstalled(done) {
      const request = { done, cancelled: false };
      requests.push(request);
      return () => {
        request.cancelled = true;
      };
    },
    launch: (app, refresh) => launches.push({ app, refresh }),
    openStore: () => calls.store++,
    playFireplace: (apps) => calls.fireplace.push(apps),
    dispose: () => calls.dispose++,
  };
  const service = createAppsService({
    config,
    platform: options.preview ? createPreviewPlatforms(() => true).apps(platform) : platform,
    catalog: { preloadedStoreId: (id) => (id === "preloaded" ? "12345" : null) },
    storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
  });
  return { service, requests, launches, data, calls };
}

test("cached labels are validated without marking discovery ready or losing unknown saved favourites", () => {
  const h = harness({
    cache: JSON.stringify([{ id: "youtube", name: "Cached YouTube", icon: "" }, null, { id: "bad", name: "Bad" }]),
  });
  h.service.restore();
  const snapshot = h.service.getSnapshot();
  assert.equal(snapshot.ready, false);
  assert.deepEqual(snapshot.all, [{ id: "youtube", name: "Cached YouTube", icon: "" }]);
  assert.equal(h.service.byId("youtube").name, "Cached YouTube");
  assert.equal(h.service.byId("unread-favourite").id, "unread-favourite");
  h.service.load();
  h.requests[0].done(null);
  assert.equal(h.service.getSnapshot(), snapshot, "failed discovery retains the cached snapshot");
  for (const cache of [
    "{",
    "{}",
    JSON.stringify(Array.from({ length: 1001 }, () => ({ id: "x", name: "X", icon: "" }))),
  ]) {
    const invalid = harness({ cache });
    invalid.service.restore();
    assert.deepEqual(invalid.service.getSnapshot().all, []);
    assert.equal(invalid.service.getSnapshot().ready, false);
  }
});

test("discovery keeps hidden provider records, resolves watcher IDs and saves only visible app labels", () => {
  const h = harness();
  const records = [
    { ...first },
    { ...second },
    { id: "hidden.service", name: "Helper", packageId: first.packageId, show: false },
    { id: "hbbtv.host", name: "Host", show: false },
    { id: "preloaded", name: "Native", packageId: "native" },
    { id: "firmware", name: "System", packageId: "firmware" },
  ];
  h.service.load();
  h.requests[0].done(records);
  const snapshot = h.service.getSnapshot();
  assert.equal(snapshot.ready, true);
  assert.deepEqual(
    snapshot.all.map((app) => app.id),
    ["preloaded", "video", "youtube"],
  );
  assert.deepEqual(snapshot.realIds, ["youtube", "video", "hbbtv.host", "12345"]);
  assert.equal(snapshot.inventory.length, 6, "provider metadata retains hidden companions");
  assert.deepEqual(h.service.defaultHome(), ["__fire", "youtube", "video"]);
  assert.deepEqual(JSON.parse(h.data.get("aerotizen.apps.v1")), snapshot.all);
  assert.equal(h.service.byId("missing"), null);
  records[0].name = "Changed outside the service";
  assert.equal(snapshot.inventory[0].name, "YouTube");
  assert.equal(snapshot.all.find((app) => app.id === "youtube").name, "YouTube");
  for (const value of [
    snapshot,
    snapshot.all,
    snapshot.all[0],
    snapshot.inventory,
    snapshot.inventory[0],
    snapshot.realIds,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
});

test("unchanged discovery does not publish or replace arrays; one changed app retains the other card", () => {
  const h = harness();
  h.service.load();
  h.requests[0].done([first, second]);
  const original = h.service.getSnapshot();
  let updates = 0;
  let discoveries = 0;
  h.service.subscribe(() => updates++);
  h.service.subscribeDiscovery(() => discoveries++);
  h.service.load();
  h.requests[1].done([{ ...first }, { ...second }]);
  assert.equal(h.service.getSnapshot(), original);
  assert.equal(updates, 0);
  assert.equal(discoveries, 1, "successful discovery still refreshes feed providers on return");
  h.service.load();
  h.requests[2].done([{ ...first }, { ...second, name: "Video renamed" }]);
  const changed = h.service.getSnapshot();
  assert.equal(
    changed.all.find((app) => app.id === first.id),
    original.all.find((app) => app.id === first.id),
  );
  assert.equal(original.all.find((app) => app.id === second.id).name, "Video");
  assert.equal(changed.realIds, original.realIds);
  assert.equal(updates, 1);
  assert.equal(discoveries, 2);
});

test("superseded, malformed and late discovery replies cannot overwrite the latest inventory", () => {
  const h = harness();
  const replies = [];
  h.service.load((success) => replies.push(["old", success]));
  h.service.load((success) => replies.push(["new", success]));
  assert.equal(h.requests[0].cancelled, true);
  h.requests[0].done([first]);
  assert.equal(h.service.getSnapshot().ready, false);
  h.requests[1].done([second]);
  h.requests[1].done([first]);
  assert.deepEqual(replies, [
    ["old", false],
    ["new", true],
  ]);
  const snapshot = h.service.getSnapshot();
  h.service.load((success) => replies.push(["invalid", success]));
  h.requests[2].done({});
  assert.equal(h.service.getSnapshot(), snapshot);
  assert.deepEqual(replies.at(-1), ["invalid", false]);
});

test("disposal cancels discovery and blocks callbacks, cache writes and commands", () => {
  const h = harness();
  const replies = [];
  h.service.load((success) => replies.push(success));
  const snapshot = h.service.getSnapshot();
  h.service.dispose();
  h.service.dispose();
  assert.equal(h.requests[0].cancelled, true);
  h.requests[0].done([first]);
  h.service.restore();
  h.service.load();
  h.service.launch(first);
  h.service.openStore();
  h.service.playFireplace();
  assert.deepEqual(replies, [false]);
  assert.equal(h.service.getSnapshot(), snapshot);
  assert.equal(h.data.size, 0);
  assert.equal(h.calls.dispose, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.launches.length, 0);
  assert.equal(h.calls.store, 0);
  assert.deepEqual(h.calls.fireplace, []);
});

test("preview IDs and sorted labels remain stable without native discovery", () => {
  const h = harness({ preview: true });
  h.service.load();
  assert.equal(h.service.byId("demo0").name, "YouTube");
  assert.equal(h.service.byId("demo4").name, "Spotify - Music and Podcasts");
  assert.equal(h.service.getSnapshot().all.length, 25);
  assert.equal(h.service.getSnapshot().ready, true);
  assert.equal(h.requests.length, 0);
  const snapshot = h.service.getSnapshot();
  h.service.load();
  assert.equal(h.service.getSnapshot(), snapshot);
});

test("disposing the TV adapter suppresses delayed handoff, native launch failure and discovery callbacks", () => {
  const calls = [];
  let ready, reply, failed;
  const host = {
    AeroTizen: {
      config,
      translate: (key) => key,
      toast: (message) => calls.push(message),
      tiles: { shortName: (name) => name },
      homewatch: {
        watch() {},
        prepareAppLaunch: (_, done) => {
          ready = done;
        },
      },
      tizen: {
        application: {
          getAppsInfo: (done) => {
            reply = done;
          },
          getAppMetaData: () => [],
          launch: (_, __, fail) => {
            failed = fail;
            calls.push("launch");
          },
        },
      },
    },
  };
  const platform = createAppsPlatform(host);
  platform.readInstalled(() => calls.push("discovery"));
  platform.launch(second, () => calls.push("refresh"));
  ready();
  platform.launch(second, () => calls.push("refresh"));
  platform.dispose();
  ready();
  reply([]);
  failed();
  platform.launch(second, () => {});
  platform.openStore();
  platform.playFireplace([]);
  platform.readInstalled(() => {});
  assert.deepEqual(calls, ["launch"]);
});

test("Fireplace keeps its local fallback when the TV application API is unavailable", () => {
  let opened = 0;
  const platform = createAppsPlatform({
    AeroTizen: {
      config,
      translate: (key) => key,
      toast() {},
      tiles: { shortName: (name) => name },
      homewatch: {
        watch() {
          throw new Error("No native handoff without application support");
        },
      },
      tizen: {},
    },
    Fireplace: { open: () => opened++ },
  });
  platform.playFireplace([{ id: "youtube", name: "YouTube" }]);
  assert.equal(opened, 1);
});
