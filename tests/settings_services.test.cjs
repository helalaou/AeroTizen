const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createSettingsServices } = loadTypeScript("launcher/src/settings/services/createSettingsServices.ts");

test("Settings resolves the optional native Home command at activation and preserves its receiver", () => {
  {
    const calls = [];
    const homewatch = {
      useSamsungHome() {
        assert.equal(this, homewatch);
        calls.push("legacy");
      },
    };
    const services = createSettingsServices({ clock: {}, homewatch }, { backgrounds: { list: [] } });
    services.useSamsungHome();
    homewatch.openSamsungHome = function () {
      assert.equal(this, homewatch);
      calls.push("native");
    };
    services.useSamsungHome();
    delete homewatch.openSamsungHome;
    services.useSamsungHome();
    assert.deepEqual(calls, ["legacy", "native", "legacy"]);
  }
});
