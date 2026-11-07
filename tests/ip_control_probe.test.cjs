const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../launcher/service/ip-control-probe.js"), "utf8");

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
    Buffer,
    require(name) {
      if (name === "./home-store") {
        return (tizen, ready, filename) => {
          assert.equal(filename, "aerotizen-ip-control-v1.json");
          ready({
            getValue: () => storage.data,
            setValue(key, data) {
              storage.data = data;
            },
          });
        };
      }
      assert.equal(name, "https");
      return https;
    },
    setTimeout,
    clearTimeout,
  });
  module.exports({
    messageport: {
      requestTrustedLocalMessagePort(name) {
        assert.equal(name, "AeroTizen.IpControlProbe");
        return { addMessagePortListener: (listener) => (receive = listener) };
      },
    },
  });
  return {
    calls,
    messages,
    async run(command = { action: "learn", nativePorts: [1, 2, 3, 4] }, appId = "DclHome001.Home") {
      const previous = messages.length;
      await receive([{ key: "test-request", value: JSON.stringify(command) }], {
        appId,
        sendMessage(items) {
          messages.push(JSON.parse(JSON.stringify(items)));
        },
      });
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
