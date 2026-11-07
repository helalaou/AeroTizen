const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = { id: "IkWsFHtOY9.Stremio", name: "Stremio", iconPath: "/icon.png" };
const secret = "a".repeat(64);
const capabilities = {
  schema_version: 1,
  root: true,
  stremio_installed: true,
  stremio_readable: true,
  stremio_app_id: app.id,
};
function harness(options = {}) {
  const requests = [],
    timers = new Map(),
    resolved = [];
  let next = 0,
    closed = 0,
    fileCallback,
    provider;
  function Xhr() {
    requests.push(this);
    this.headers = {};
  }
  Xhr.prototype.open = function (method, url) {
    Object.assign(this, { method, url });
  };
  Xhr.prototype.setRequestHeader = function (key, value) {
    this.headers[key] = value;
  };
  Xhr.prototype.send = function () {};
  Xhr.prototype.abort = function () {
    this.aborted = true;
    this.onabort?.();
  };
  let contents =
    options.contents === undefined ? JSON.stringify({ schema_version: 1, token: secret }) : options.contents;
  const stream = {
    read: () => contents,
    close() {
      closed++;
    },
  };
  const file = {
    get fileSize() {
      return contents.length;
    },
    openStream: (mode, done) => {
      fileCallback = () => done(stream);
      if (!options.delayed) fileCallback();
    },
  };
  const A = {
    continueWatching: {
      register(adapter) {
        provider = adapter;
      },
    },
    catalog: { storeId: (id) => (id === app.id ? "3202306031311" : null) },
    tiles: { shortName: (name) => name },
    tizen: {
      filesystem: {
        resolve(path, done, failed, mode) {
          resolved.push({ path, mode });
          if (options.missing) failed();
          else done(file);
        },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync("launcher/js/stremio-continue.js", "utf8"), {
    window: { AeroTizen: A },
    XMLHttpRequest: Xhr,
    setTimeout: (fn) => {
      timers.set(++next, fn);
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  return {
    provider,
    discover(inventory, done) {
      const [source] = provider.discover(inventory);
      if (!source) {
        done(null);
        return;
      }
      provider.check(source, (available) => done(available ? source : null));
    },
    requests,
    timers,
    resolved,
    get closed() {
      return closed;
    },
    deliverFile: () => fileCallback(),
    publishCredential() {
      options.missing = false;
      contents = JSON.stringify({ schema_version: 1, token: secret });
    },
    respond(index, data, status = 200) {
      Object.assign(requests[index], { status, responseText: JSON.stringify(data) });
      requests[index].onload();
    },
  };
}

test("Stremio discovery requires exact installation and private credentials; it never reads items before selection", () => {
  const h = harness();
  let source;
  h.discover([{ id: "other", name: "Stremio" }], (value) => {
    source = value;
  });
  assert.equal(source, null);
  assert.equal(h.resolved.length, 0);
  assert.equal(h.requests.length, 0);
  h.discover([app], (value) => {
    source = value;
  });
  assert.deepEqual(h.resolved, [{ path: "wgt-private/stremio-feed.json", mode: "r" }]);
  assert.equal(h.closed, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests[0].url, "http://127.0.0.1:47791/v1/capabilities");
  assert.equal(h.requests[0].method, "GET");
  assert.deepEqual(h.requests[0].headers, { "X-AeroTizen-Token": secret });
  h.respond(0, capabilities);
  assert.equal(source.id, app.id);
  assert.equal(source.storeId, "3202306031311");
  assert.equal(Object.hasOwn(source, "token"), false);
  assert.equal(h.requests.length, 1);
  h.provider.read(source, (error, records) => {
    assert.equal(error, false);
    assert.equal(records.length, 0);
  });
  h.respond(1, { schema_version: 1, records: [] });
  assert.equal(h.requests[1].url, "http://127.0.0.1:47791/v1/stremio/items");
});

test("non-root, missing app, unreadable cache and mismatched protocol never expose Stremio", () => {
  for (const changed of [
    { root: false },
    { stremio_installed: false },
    { stremio_readable: false },
    { stremio_app_id: "other" },
    { schema_version: 2 },
  ]) {
    const h = harness();
    let source;
    h.discover([app], (value) => {
      source = value;
    });
    h.respond(0, { ...capabilities, ...changed });
    assert.equal(source, null);
  }
  for (const options of [
    { missing: true },
    { contents: "{}" },
    { contents: "{bad" },
    { contents: JSON.stringify({ schema_version: 1, token: "bad" }) },
    { contents: "x".repeat(513) },
  ]) {
    const h = harness(options);
    let source;
    h.discover([app], (value) => {
      source = value;
    });
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, "http://127.0.0.1:47791/v1/credential");
    h.respond(0, null, 503);
    assert.equal(source, null);
    assert.equal(h.timers.size, 0);
  }
});

test("Stremio requests a missing or stale credential once before checking capabilities", () => {
  for (const stale of [false, true]) {
    const h = harness({ missing: !stale, contents: JSON.stringify({ schema_version: 1, token: "b".repeat(64) }) });
    let source;
    h.discover([app], (value) => {
      source = value;
    });
    const prepareIndex = stale ? 1 : 0;
    if (stale) h.respond(0, null, 401);
    const prepare = h.requests[prepareIndex];
    assert.equal(prepare.method, "POST");
    assert.equal(prepare.url, "http://127.0.0.1:47791/v1/credential");
    assert.deepEqual(prepare.headers, {});
    h.publishCredential();
    h.respond(prepareIndex, null, 204);
    assert.deepEqual(h.requests[prepareIndex + 1].headers, { "X-AeroTizen-Token": secret });
    h.respond(prepareIndex + 1, capabilities);
    assert.equal(source.id, app.id);
  }
});

test("Stremio gives up when the prepared credential is still rejected", () => {
  const h = harness({ missing: true });
  let source;
  h.discover([app], (value) => {
    source = value;
  });
  h.publishCredential();
  h.respond(0, null, 204);
  h.respond(1, null, 401);
  assert.equal(source, null);
  assert.equal(h.requests.length, 2);
});

test("cancellation rejects late capability and filesystem callbacks and releases streams", () => {
  const h = harness();
  let calls = 0;
  h.discover([app], () => {
    calls++;
  });
  h.provider.cancel();
  assert.equal(h.requests[0].aborted, true);
  h.respond(0, capabilities);
  assert.equal(calls, 0);
  const delayed = harness({ delayed: true });
  delayed.discover([app], () => {
    calls++;
  });
  delayed.provider.cancel();
  delayed.deliverFile();
  assert.equal(delayed.closed, 1);
  assert.equal(delayed.requests.length, 0);
  assert.equal(delayed.timers.size, 0);
  assert.equal(calls, 0);
});

test("helper loss and oversized or malformed responses fail closed", () => {
  const h = harness();
  let source;
  h.discover([app], (value) => {
    source = value;
  });
  h.respond(0, capabilities);
  let failed = false;
  h.provider.read(source, (error) => {
    failed = error;
  });
  h.respond(1, { schema_version: 1, records: [] }, 503);
  assert.equal(failed, true);
  h.provider.read(source, (error) => {
    assert.equal(error, true);
  });
  assert.equal(h.requests.length, 2);
  const oversized = harness();
  let exposed;
  oversized.discover([app], (value) => {
    exposed = value;
  });
  oversized.respond(0, { ...capabilities, junk: "x".repeat(4096) });
  assert.equal(exposed, null);
});
