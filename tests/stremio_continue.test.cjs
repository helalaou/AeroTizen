const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createStremioContinueWatchingProvider } = loadTypeScript(
  "launcher/src/platform/tizen/createStremioContinueWatchingProvider.ts",
);
const frozenSource = fs.readFileSync("tests/fixtures/legacy-launcher/js/stremio-continue.js", "utf8");

const app = { id: "IkWsFHtOY9.Stremio", name: "Stremio", iconPath: "/icon.png" };
const secret = "a".repeat(64);
const capabilities = {
  schema_version: 1,
  root: true,
  stremio_installed: true,
  stremio_readable: true,
  stremio_app_id: app.id,
};
function createHarness(options = {}, legacy = false) {
  const requests = [],
    timers = new Map(),
    resolved = [],
    launches = [],
    delays = [],
    opened = [];
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
    if (!options.silentAbort) this.onabort?.();
    if (options.abortThrows) throw new Error("Abort failed");
  };
  let contents =
    options.contents === undefined ? JSON.stringify({ schema_version: 1, token: secret }) : options.contents;
  const stream = {
    read: () => {
      if (options.readThrows) throw new Error("Read denied");
      return contents;
    },
    close() {
      closed++;
      if (options.closeThrows) throw new Error("Close failed");
    },
  };
  const file = {
    get fileSize() {
      return contents.length;
    },
    openStream: (mode, done, failed, encoding) => {
      opened.push({ mode, encoding });
      if (options.openThrows) throw new Error("Open denied");
      fileCallback = () => done(stream);
      if (!options.delayed) fileCallback();
    },
  };
  const A = {
    apps: { launch: (record) => launches.push(record) },
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
  const clock = {
    setTimeout: (fn, ms) => {
      delays.push(ms);
      timers.set(++next, fn);
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  if (legacy) {
    vm.runInNewContext(frozenSource, { window: { AeroTizen: A }, XMLHttpRequest: Xhr, ...clock });
    provider = A.continueWatchingProviders[0];
  } else {
    provider = createStremioContinueWatchingProvider({
      runtime: A,
      createRequest: () => {
        if (options.requestThrows) throw new Error("Transport unavailable");
        return new Xhr();
      },
      timers: clock,
    });
  }
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
    delays,
    opened,
    launches,
    runtime: A,
    get closed() {
      return closed;
    },
    deliverFile: () => fileCallback(),
    publishCredential() {
      options.missing = false;
      contents = JSON.stringify({ schema_version: 1, token: secret });
    },
    respondRaw(index, text, status = 200) {
      Object.assign(requests[index], { status, responseText: text });
      requests[index].onload();
    },
    respond(index, data, status = 200) {
      Object.assign(requests[index], { status, responseText: JSON.stringify(data) });
      requests[index].onload();
    },
  };
}

for (const legacy of [true, false]) {
  const harness = (options) => createHarness(options, legacy);
  const scenario = (name, fn) => test((legacy ? "frozen: " : "typed: ") + name, fn);
  scenario(
    "Stremio discovery requires exact installation and private credentials; it never reads items before selection",
    () => {
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
      assert.equal(h.requests[0].timeout, 1800);
      assert.deepEqual(h.delays, [2000]);
      assert.deepEqual(h.opened, [{ mode: "r", encoding: "UTF-8" }]);
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
    },
  );

  scenario("non-root, missing app, unreadable cache and mismatched protocol never expose Stremio", () => {
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

  scenario("Stremio requests a missing or stale credential once before checking capabilities", () => {
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

  scenario("Stremio gives up when the prepared credential is still rejected", () => {
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

  scenario("cancellation rejects late capability and filesystem callbacks and releases streams", () => {
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

  scenario("helper loss and oversized or malformed responses fail closed", () => {
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

  scenario("bounded records keep artwork, episode fallbacks and the normal app launch", () => {
    const h = harness();
    let source;
    h.discover(Object.freeze([Object.freeze(app)]), (value) => {
      source = value;
    });
    h.respond(0, capabilities);
    const records = [
      { content_id: "tt1234567", season: 2, episode: 9, thumbnail_url: "poster", custom: "kept" },
      { content_id: "tt12345678", episode: 3 },
      { content_id: "tt123456789", season: -1, episode: 1 },
      { content_id: "tt1234567", season: 1.5, episode: 3, thumbnail_url: "existing" },
      { content_id: "tt1234567890123", thumbnail_url: "existing" },
      null,
      "invalid",
      ...Array.from({ length: 250 }, (_, i) => ({ content_id: "item" + i })),
    ];
    let result;
    h.provider.read(source, (error, values) => {
      assert.equal(error, false);
      result = JSON.parse(JSON.stringify(values));
    });
    h.respond(1, { schema_version: 1, records });
    assert.equal(result.length, 200);
    assert.equal(result[0].background_url, "https://images.metahub.space/background/medium/tt1234567/img");
    assert.equal(result[0].thumbnail_url, "https://episodes.metahub.space/tt1234567/2/9/w780.jpg");
    assert.equal(result[0].custom, "kept");
    assert.equal(result[1].thumbnail_url, "https://episodes.metahub.space/tt12345678/0/3/w780.jpg");
    assert.equal(result[2].thumbnail_url, "https://episodes.metahub.space/tt123456789/0/1/w780.jpg");
    assert.equal(result[3].thumbnail_url, "existing");
    assert.deepEqual(result[4], records[4]);
    assert.deepEqual(result.slice(5, 7), [null, "invalid"]);
    h.provider.open({ sourceId: app.id, sourceName: app.name, payload: "not interpreted by this provider" });
    assert.deepEqual(JSON.parse(JSON.stringify(h.launches)), [{ id: app.id, name: app.name }]);
  });

  scenario("credential timeout rejects a late stream and never retries preparation more than once", () => {
    const h = harness({ delayed: true });
    let replies = 0;
    h.discover([app], () => {
      replies++;
    });
    assert.deepEqual(h.delays, [2000]);
    const deadline = [...h.timers.values()][0];
    deadline();
    assert.equal(h.requests[0].method, "POST");
    h.deliverFile();
    assert.equal(h.closed, 1);
    assert.equal(h.requests.length, 1);
    h.respond(0, null, 503);
    deadline();
    assert.equal(replies, 1);
    assert.equal(h.timers.size, 0);
  });

  scenario("malformed, oversized and timeout item replies clear authorization without exposing records", () => {
    for (const response of [
      "not JSON",
      "null",
      "{}",
      JSON.stringify({ schema_version: 2, records: [] }),
      JSON.stringify({ schema_version: 1, records: {} }),
      "x".repeat(2000001),
      null,
    ]) {
      const h = harness();
      let source,
        calls = 0;
      h.discover([app], (value) => {
        source = value;
      });
      h.respond(0, capabilities);
      h.provider.read(source, (error) => {
        assert.equal(error, true);
        calls++;
      });
      if (response === null) h.requests[1].ontimeout();
      else h.respondRaw(1, response);
      h.requests[1].onerror();
      assert.equal(calls, 1);
      h.provider.read(source, (error) => assert.equal(error, true));
      assert.equal(h.requests.length, 2);
    }
  });
}

test("typed cancellation releases silent and throwing transports, rejects late replies and allows a new check", () => {
  const h = createHarness({ silentAbort: true, abortThrows: true });
  let source,
    replies = 0;
  h.discover([app], (value) => {
    source = value;
  });
  h.respond(0, capabilities);
  h.provider.read(source, () => replies++);
  h.provider.read(source, () => replies++);
  h.provider.cancel();
  h.provider.cancel();
  assert.ok(h.requests.slice(1).every((xhr) => xhr.aborted));
  h.respond(1, { schema_version: 1, records: [] });
  h.respond(2, { schema_version: 1, records: [] });
  assert.equal(replies, 0);
  h.discover([app], (value) => {
    source = value;
  });
  h.respond(3, capabilities);
  h.provider.read(source, () => replies++);
  h.respond(4, { schema_version: 1, records: [] });
  assert.equal(replies, 1);
});

test("typed disposal closes late streams, aborts reads and prevents future credential work and launches", () => {
  const options = {};
  const h = createHarness(options);
  let source,
    replies = 0;
  h.discover([app], (value) => {
    source = value;
  });
  h.respond(0, capabilities);
  options.delayed = true;
  h.provider.check(source, () => replies++);
  h.provider.read(source, () => replies++);
  h.provider.dispose();
  h.provider.dispose();
  h.deliverFile();
  h.respond(1, { schema_version: 1, records: [] });
  assert.equal(replies, 0);
  assert.equal(h.closed, 2);
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests[1].aborted, true);
  assert.deepEqual(h.provider.discover([app]), []);
  h.provider.check(source, (available) => assert.equal(available, false));
  h.provider.read(source, (error) => assert.equal(error, true));
  h.provider.open({ sourceId: app.id, sourceName: app.name });
  assert.equal(h.requests.length, 2);
  assert.equal(h.resolved.length, 2);
  assert.deepEqual(h.launches, []);
});

test("typed transport construction and credential I/O failures finish without leaking timers or credentials", () => {
  for (const options of [{ requestThrows: true }, { readThrows: true }, { closeThrows: true }, { openThrows: true }]) {
    const h = createHarness(options);
    let source;
    h.discover([app], (value) => {
      source = value;
    });
    if (h.requests.length) h.respond(0, null, 503);
    assert.equal(source, null);
    assert.equal(h.timers.size, 0);
    assert.equal(h.requests.length, options.requestThrows ? 0 : 1);
  }
});
