const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { translateEnglish } = require("./helpers/translate_english.cjs");
const { createSamsungContinueWatchingProvider } = loadTypeScript(
  "launcher/src/platform/tizen/createSamsungContinueWatchingProvider.ts",
);
const prefix = "http://samsung.com/tv/metadata/";
const source = { id: "video", name: "Video", storeId: "123" };
const item = { sourceId: "video", title: "Episode", payload: '{"route":"episode://1","unicode":"é"}' };
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness(options = {}) {
  const requests = [],
    launches = [],
    watches = [],
    toasts = [],
    metadataReads = [];
  const metadata = new Map();
  const runtime = {
    config: { HIDDEN_APPS: /service|hidden/ },
    catalog: { storeId: (id) => (id === "video" ? "123" : null) },
    tiles: { shortName: (name) => name.replace(/ - .*/, "") },
    homewatch: { watch: (id) => watches.push(id) },
    tizen: {
      application: {
        getAppMetaData(id) {
          metadataReads.push(id);
          const value = metadata.get(id);
          if (value instanceof Error) throw value;
          return value || [];
        },
        launchAppControl(control, id, done, failed) {
          launches.push({ control: plain(control), id, failed });
        },
      },
      ApplicationControl: function (operation, uri, mime, category, data) {
        Object.assign(this, { operation, data });
      },
      ApplicationControlData: function (key, values) {
        Object.assign(this, { key, value: values });
      },
    },
    translate: translateEnglish,
    toast: (message) => toasts.push(message),
  };
  class Request {
    constructor() {
      requests.push(this);
    }
    open(method, url, async) {
      Object.assign(this, { method, url, async });
    }
    setRequestHeader(key, value) {
      this.header = [key, value];
    }
    send() {
      this.sent = true;
    }
    abort() {
      this.aborted = true;
      if (!options.silentAbort) this.onabort?.();
      if (options.abortThrows) throw new Error("abort failed");
    }
  }
  const provider = createSamsungContinueWatchingProvider({
    catalog: runtime.catalog,
    runtime,
    createRequest: () => new Request(),
    now: () => 1000,
  });
  return {
    provider,
    runtime,
    requests,
    launches,
    watches,
    toasts,
    metadata,
    metadataReads,
    respond(index, text, status = 200) {
      const request = requests[index];
      Object.assign(request, { status, responseText: text });
      request.onload();
    },
  };
}

test(`hidden companion metadata, exact identities, preferred foreground app and status match`, () => {
  const h = harness();
  h.metadata.set("hidden.service", [{ key: prefix + "use.continue_watching", value: "bg_service" }]);
  h.metadata.set("unmapped", [{ key: prefix + "app_support_continue_watching", value: "true" }]);
  h.metadata.set("preview", [{ key: prefix + "use.preview", value: "true" }]);
  h.metadata.set("denied", new Error("metadata denied"));
  const inventory = Object.freeze(
    [
      { id: "alias", packageId: "shared", name: "Alias" },
      { id: "hidden.service", packageId: "shared", show: false },
      { id: "video", packageId: "shared", name: "Video - offers", iconPath: "icon.png" },
      { id: "unmapped", packageId: "unknown", name: "Video" },
      { id: "preview", name: "Preview" },
      { id: "denied", name: "Denied" },
    ].map(Object.freeze),
  );
  assert.deepEqual(plain(h.provider.discover(inventory)), [
    { ...source, icon: "icon.png", status: "Not selected" },
    { id: "unmapped", name: "Video", icon: "", storeId: "", status: "App ID unavailable" },
  ]);
  assert.equal(h.metadataReads.length, inventory.length, "native metadata queries are not added or skipped");
});

test(`every request keeps the URL, app_id header, timeout and unique cache buster`, () => {
  const h = harness(),
    replies = [];
  h.provider.read(source, (...reply) => replies.push(reply));
  h.provider.read({ ...source, storeId: "456" }, () => {});
  h.provider.read(source, () => {});
  const urls = h.requests.map((request) => {
    assert.equal(request.method, "GET");
    assert.equal(request.async, true);
    assert.equal(request.timeout, 5000);
    assert.equal(request.sent, true);
    const url = new URL(request.url);
    assert.equal(url.origin, "http://localhost:9013");
    assert.equal(url.searchParams.get("module"), "EBHelper");
    assert.equal(url.searchParams.get("func"), "GetItems");
    return url.searchParams.get("_aerotizen");
  });
  assert.deepEqual(urls, ["123-1000-1", "456-1000-2", "123-1000-3"]);
  assert.deepEqual(
    h.requests.map((request) => request.header),
    [
      ["app_id", "123"],
      ["app_id", "456"],
      ["app_id", "123"],
    ],
  );
  const data = [{ content_id: "episode", payload: item.payload }];
  h.respond(0, JSON.stringify(data));
  h.requests[0].onerror();
  assert.deepEqual(plain(replies), [[false, data]], "a request settles only once");
});

test(`HTTP, malformed, oversized and timeout failures remain isolated`, () => {
  const h = harness(),
    results = [];
  for (const [text, status] of [
    ["[]", 500],
    ["not json", 200],
    ["{}", 200],
    ["x".repeat(2000001), 200],
  ]) {
    h.provider.read(source, (error) => results.push(error));
    h.respond(h.requests.length - 1, text, status);
  }
  h.provider.read(source, (error) => results.push(error));
  h.requests.at(-1).ontimeout();
  h.requests.at(-1).onerror();
  assert.deepEqual(results, [true, true, true, true, true]);
  h.provider.read(source, (error, data) => results.push([error, data]));
  h.respond(h.requests.length - 1, "[]");
  assert.deepEqual(plain(results.at(-1)), [false, []]);
});

test(`native launch preserves payload and watcher fallback`, () => {
  const h = harness();
  h.provider.open(item);
  assert.deepEqual(h.watches, [item.sourceId]);
  assert.deepEqual(h.launches[0].control, {
    operation: "http://tizen.org/appcontrol/operation/view",
    data: [{ key: "PAYLOAD", value: [JSON.stringify({ values: item.payload })] }],
  });
  assert.equal(h.launches[0].id, item.sourceId);
  h.launches[0].failed({ cancelled: true });
  assert.deepEqual(h.toasts, []);
  h.launches[0].failed({ name: "Denied" });
  assert.deepEqual(h.toasts, ["Could not open Episode"]);
});

test("cancellation settles silent or throwing aborts and rejects late delivery without disabling future reads", () => {
  const h = harness({ silentAbort: true, abortThrows: true }),
    replies = [];
  h.provider.read(source, (error) => replies.push(error));
  h.provider.read(source, (error) => replies.push(error));
  h.provider.cancel();
  h.provider.cancel();
  assert.ok(h.requests.every((request) => request.aborted));
  h.respond(0, "[]");
  h.respond(1, "[]");
  assert.deepEqual(replies, [true, true]);
  h.provider.read(source, (error) => replies.push(error));
  h.respond(2, "[]");
  assert.deepEqual(replies, [true, true, false]);
});

test("feed cancellation during an acknowledged native handoff still permits the launch", () => {
  const h = harness();
  let ready;
  h.runtime.homewatch.prepareAppLaunch = (_, done) => {
    ready = done;
  };
  h.provider.open(item);
  h.provider.cancel();
  assert.equal(h.launches.length, 0);
  ready();
  ready();
  assert.equal(h.launches.length, 1);
  assert.deepEqual(h.watches, []);
});

test("disposal cancels transport and suppresses later metadata reads, handoffs and failures", () => {
  const h = harness();
  let ready;
  h.runtime.homewatch.prepareAppLaunch = (_, done) => {
    ready = done;
  };
  h.provider.read(source, () => {});
  h.provider.open(item);
  h.provider.dispose();
  h.provider.dispose();
  ready();
  h.respond(0, "[]");
  h.provider.open(item);
  assert.deepEqual(h.provider.discover([{ id: "video", name: "Video" }]), []);
  h.provider.read(source, (error) => assert.equal(error, true));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].aborted, true);
  assert.equal(h.launches.length, 0);
  assert.equal(h.metadataReads.length, 0);
  assert.deepEqual(h.toasts, []);
});
