"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createNativeHomeTestService } = loadTypeScript("launcher/src/settings/services/createNativeHomeTestService.ts");

test("the UI service never posts on refresh and blocks setters until a successful Get test", async () => {
  let report = { status: "not_run", can_set: false };
  const calls = [];
  const service = createNativeHomeTestService({
    async startService() {},
    async request(method, action = "get") {
      calls.push([method, action]);
      if (method === "POST")
        report =
          action === "get"
            ? { status: "query_completed", can_set: true }
            : {
                status: "query_completed",
                can_set: false,
                set_test: { status: "query_completed", query: { success: true, baseline_unchanged: true } },
              };
      return report;
    },
  });
  await service.refresh();
  await service.run("set");
  assert.deepEqual(calls, [["GET", "get"]]);
  await service.run("get");
  assert.equal(service.getSnapshot().message, "getPassed");
  await service.run("set");
  assert.equal(service.getSnapshot().message, "setPassed");
  await service.run("set");
  assert.equal(calls.filter(([method]) => method === "POST").length, 2);
});

test("lost service replies show recovery feedback without retrying a write", async () => {
  const calls = [];
  const service = createNativeHomeTestService({
    async startService() {},
    async request(method) {
      calls.push(method);
      if (method === "POST") throw new Error("connection lost");
      return { status: "not_run" };
    },
  });
  await service.refresh();
  await service.run("get");
  assert.equal(service.getSnapshot().message, "offline");
  assert.deepEqual(calls, ["GET", "POST"]);
});

test("closing the screen while connecting prevents a late service start", async () => {
  let reject;
  let starts = 0;
  const service = createNativeHomeTestService({
    startService: async () => {
      starts++;
    },
    request: () =>
      new Promise((resolve, fail) => {
        reject = fail;
      }),
  });
  const loading = service.refresh();
  service.dispose();
  reject(new Error("unavailable"));
  await loading;
  assert.equal(starts, 0);
});

test("an interrupted test loads as interrupted and remains blocked", async () => {
  const calls = [];
  const service = createNativeHomeTestService({
    async startService() {},
    async request(method) {
      calls.push(method);
      return { status: "interrupted", can_set: false };
    },
  });
  await service.refresh();
  await service.run("get");
  await service.run("set");
  assert.equal(service.getSnapshot().message, "interrupted");
  assert.deepEqual(calls, ["GET"]);
});

test("a changed readback cannot show Set test passed", async () => {
  const service = createNativeHomeTestService({
    async startService() {},
    async request() {
      return {
        status: "query_completed",
        can_set: false,
        set_test: { status: "query_completed", query: { success: true, baseline_unchanged: false } },
      };
    },
  });
  await service.refresh();
  assert.equal(service.getSnapshot().message, "changed");
});
