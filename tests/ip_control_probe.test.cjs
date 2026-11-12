const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const vm = require("node:vm");

const { compileTypeScript, loadTypeScript } = require("./helpers/load_typescript.cjs");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const bundled = process.env.AEROTIZEN_TEST_SERVICE_BUNDLE;
const source = bundled
  ? readFileSync(path.join(__dirname, "../dist/launcher/service/ip-control.js"), "utf8")
  : compileTypeScript("launcher/src/service/createIpControl.ts");

function harness(replies, storage = { data: null }) {
  const calls = [];
  const messages = [];
  const module = { exports: {} };
  let receive;
  const https = {
    request(options, onResponse) {
      const request = new EventEmitter();
      request.destroy = () => request.emit("close");
      request.end = (body) => {
        calls.push({ options, body: JSON.parse(body) });
        const response = new EventEmitter();
        response.statusCode = 200;
        response.setEncoding = () => {};
        onResponse(response);
        response.emit("data", JSON.stringify({ jsonrpc: "2.0", id: 1, ...replies.shift() }));
        response.emit("end");
        request.emit("close");
      };
      return request;
    },
  };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    Buffer,
    require(name) {
      if (name === "fs")
        return {
          __esModule: true,
          statSync() {
            if (storage.data === null) throw Object.assign(new Error("Missing"), { code: "ENOENT" });
            return { size: Buffer.byteLength(storage.data) };
          },
          readFileSync: () => storage.data,
          openSync: (value) => value,
          writeFileSync(_, value) {
            if (storage.failWrite) throw new Error("Storage unavailable");
            storage.pending = value;
          },
          fsyncSync() {},
          closeSync() {},
          renameSync() {
            storage.data = storage.pending;
          },
          unlinkSync() {},
        };
      if (name === "../contracts/ipControl") return loadTypeScript("launcher/src/contracts/ipControl.ts");
      if (name === "./protocol") return loadTypeScript("launcher/src/service/protocol.ts");
      if (name === "./openHomeStore") {
        return {
          __esModule: true,
          default: (tizen, ready, filename) => {
            assert.equal(filename, "aerotizen-ip-control-v1.json");
            ready({
              getValue: () => storage.data,
              setValue(key, data) {
                if (storage.failWrite) throw new Error("Storage unavailable");
                storage.data = data;
              },
            });
          },
        };
      }
      assert.equal(name, "https");
      return https;
    },
    setTimeout,
    clearTimeout,
  });
  const dispose = (bundled ? module.exports : module.exports.default)({
    filesystem: {
      resolve(_, ready) {
        ready({ toURI: () => "file:///tmp/aerotizen-ip-test" });
      },
    },
    messageport: {
      requestTrustedLocalMessagePort(name) {
        assert.equal(name, "AeroTizen.IpControlProbe");
        return { addMessagePortListener: (listener) => (receive = listener), removeMessagePortListener() {} };
      },
    },
  });
  return {
    calls,
    messages,
    dispose,
    async run(command = { action: "learn", nativePorts: [1, 2, 3, 4] }, appId = "DclHome001.Home") {
      const previous = messages.length;
      await receive([{ key: "test-request", value: JSON.stringify(command) }], {
        appId,
        sendMessage(items) {
          messages.push(JSON.parse(JSON.stringify(items)));
        },
      });
      await new Promise(setImmediate);
      return messages.length > previous ? JSON.parse(messages[previous][0].value) : undefined;
    },
  };
}

test("the launcher learns a missing active HDMI port, and the service restores it and switches after a restart", async () => {
  const storage = { data: null };
  const h = harness([{ result: { AccessToken: "test-token" } }, { result: { inputSource: "HDMI5" } }], storage);
  await h.run({ action: "learn", nativePorts: [] }, "other.app");
  assert.equal(h.calls.length, 0);
  assert.deepEqual(await h.run(), { status: "added", port: 5, ports: [5] });
  assert.deepEqual(
    h.calls.map(({ body }) => body),
    [
      { jsonrpc: "2.0", id: 1, method: "createAccessToken" },
      { jsonrpc: "2.0", id: 1, method: "getTVStates", params: { AccessToken: "test-token" } },
    ],
  );
  for (const { options } of h.calls) {
    assert.equal(options.hostname, "127.0.0.1");
    assert.equal(options.port, 1516);
  }
  assert.equal(h.messages[0][0].key, "test-request");
  const restarted = harness([{ result: {} }], storage);
  assert.deepEqual(await restarted.run({ action: "list" }), { status: "listed", ports: [5] });
  assert.deepEqual(await restarted.run({ action: "switch", port: 6 }), { status: "switchFailed" });
  assert.equal(restarted.calls.length, 0);
  assert.deepEqual(await restarted.run({ action: "switch", port: 5 }), { status: "switched" });
  assert.deepEqual(restarted.calls[0].body, {
    jsonrpc: "2.0",
    id: 1,
    method: "inputSourceControl",
    params: { AccessToken: "test-token", inputSource: "HDMI5" },
  });
});

test("a Tizen-reported port needs no fallback, and subsequent reads reuse the pairing", async () => {
  const h = harness([
    { result: { AccessToken: "test-token" } },
    { result: { inputSource: "HDMI3" } },
    { result: { inputSource: "HDMI 5" } },
  ]);
  assert.deepEqual(await h.run(), { status: "known", port: 3, ports: [] });
  assert.deepEqual(await h.run(), { status: "added", port: 5, ports: [5] });
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].body.method, "getTVStates");
});

test("the probe distinguishes failed pairing from a failed status read and can be retried", async () => {
  const h = harness([
    { error: { code: -32010 } },
    { result: { AccessToken: "test-token" } },
    { error: { code: -32601 } },
  ]);
  assert.deepEqual(await h.run(), { status: "pairFailed" });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(await h.run(), { status: "readFailed" });
});

test("a revoked token pairs again and saves the replacement without dropping learned ports", async () => {
  const storage = { data: JSON.stringify({ token: "expired", ports: [5] }) };
  const h = harness(
    [{ error: { code: -32010 } }, { result: { AccessToken: "replacement" } }, { result: { inputSource: "HDMI6" } }],
    storage,
  );
  assert.deepEqual(await h.run(), { status: "added", port: 6, ports: [5, 6] });
  assert.deepEqual(JSON.parse(storage.data), { token: "replacement", ports: [5, 6] });
  h.dispose();
});

test("invalid sources and failed storage do not create a learned tile", async () => {
  const storage = { data: null, failWrite: true };
  const h = harness([{ result: { AccessToken: "token" } }, { result: { inputSource: "HDMI5" } }], storage);
  assert.deepEqual(await h.run(), { status: "storageFailed" });
  assert.deepEqual(await h.run({ action: "list" }), { status: "listed", ports: [] });
  assert.deepEqual(await h.run({ action: "switch", port: 1000 }), { status: "unavailable" });
  assert.equal(h.calls.length, 2);
  h.dispose();
});

test("service disposal prevents later pairing and message delivery", async () => {
  const h = harness([]);
  h.dispose();
  assert.equal(await h.run(), undefined);
  assert.equal(h.calls.length, 0);
});
