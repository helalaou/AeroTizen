const assert = require("node:assert/strict");
const { test } = require("node:test");

const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { getInputPresentation } = loadTypeScript("launcher/src/home/presentation/inputs.ts");
const { getNetworkPresentation } = loadTypeScript("launcher/src/status/presentation/network.ts");
const { getWeatherPresentation } = loadTypeScript("launcher/src/status/presentation/weather.ts");

const input = (source, label = "HDMI 1", capabilities = {}) =>
  getInputPresentation(source, label, { pinned: false, recognized: false, ...capabilities });

test("Live TV keeps its own artwork and status regardless of its label or capabilities", () => {
  const source = Object.freeze({ type: "TV", active: true, connected: true });
  assert.deepEqual(input(source, "Xbox", { pinned: true, recognized: true }), {
    kind: "tv",
    status: "live",
    statusLabel: "TV",
    disconnected: false,
  });
});

test("input artwork recognizes device names and preserves the priority of overlapping matches", () => {
  const cases = [
    { label: "PlayStation 5", kind: "game" },
    { label: "Mac laptop", kind: "pc" },
    { label: "Apple TV", kind: "box" },
    { label: "Game console PC", kind: "game" },
    { label: "PC cable box", kind: "pc" },
    { label: "HDMI 1", kind: "hdmi" },
  ];
  for (const { label, kind } of cases) {
    assert.equal(input({ type: "HDMI" }, label).kind, kind, label);
  }
});

test("input status uses active, connected, recognized and pinned priority in that order", () => {
  const capabilities = { pinned: true, recognized: true };
  assert.equal(input({ type: "HDMI", active: true, connected: true }, "", capabilities).status, "active");
  assert.equal(input({ type: "HDMI", connected: true }, "", capabilities).status, "connected");
  assert.equal(input({ type: "HDMI", connected: false }, "", capabilities).status, "recognized");
  assert.equal(input({ type: "HDMI", connected: false }, "", { pinned: true }).status, "pinned");
  assert.equal(input({ type: "HDMI", connected: false }).statusLabel, "OFF");
});

test("only an explicitly disconnected input without an override gets disconnected styling", () => {
  assert.equal(input({ type: "HDMI" }).disconnected, false);
  assert.equal(input({ type: "HDMI", connected: false }).disconnected, true);
  assert.equal(input({ type: "HDMI", connected: false, active: true }).disconnected, false);
  assert.equal(input({ type: "HDMI", connected: false }, "", { recognized: true }).disconnected, false);
  assert.equal(input({ type: "HDMI", connected: false }, "", { pinned: true }).disconnected, false);
});

test("Wi-Fi signal tiers retain their strict threshold boundaries", () => {
  const cases = [
    { strength: 1, symbol: "wifi" },
    { strength: 0.67, symbol: "wifi" },
    { strength: 0.66, symbol: "wifiHigh" },
    { strength: 0.34, symbol: "wifiHigh" },
    { strength: 0.33, symbol: "wifiLow" },
    { strength: 0, symbol: "wifiLow" },
  ];
  for (const { strength, symbol } of cases) {
    assert.deepEqual(getNetworkPresentation({ kind: "wifi", strength }), { symbol, label: "Wi-Fi" });
  }
});

test("missing Wi-Fi signal is distinct from an offline or unavailable network", () => {
  assert.deepEqual(getNetworkPresentation({ kind: "wifi", strength: null }), {
    symbol: "wifi",
    label: "Wi-Fi (signal unavailable)",
  });
  assert.deepEqual(getNetworkPresentation({ kind: "unknown", strength: null }), {
    symbol: "unknown",
    label: "Network status unavailable",
  });
  assert.equal(getNetworkPresentation({ kind: "offline", strength: 1 }).symbol, "offline");
  assert.equal(getNetworkPresentation({ kind: "ethernet", strength: 0 }).symbol, "ethernet");
});

test("weather labels and artwork agree for clear skies, clouds, fog and snow showers", () => {
  const cases = [
    { code: 0, symbol: "sun", condition: "Clear" },
    { code: 1, symbol: "sun", condition: "Mainly clear" },
    { code: 2, symbol: "partly", condition: "Partly cloudy" },
    { code: 3, symbol: "cloud", condition: "Cloudy" },
    { code: 48, symbol: "fog", condition: "Fog" },
    { code: 85, symbol: "snow", condition: "Snow" },
    { code: 86, symbol: "snow", condition: "Snow" },
  ];
  for (const { code, symbol, condition } of cases) {
    assert.deepEqual(getWeatherPresentation(code), { symbol, condition });
  }
});

test("weather code ranges include both endpoints", () => {
  const cases = [
    { min: 51, max: 57, symbol: "rain", condition: "Drizzle" },
    { min: 61, max: 67, symbol: "rain", condition: "Rain" },
    { min: 71, max: 77, symbol: "snow", condition: "Snow" },
    { min: 80, max: 82, symbol: "rain", condition: "Showers" },
    { min: 95, max: 99, symbol: "storm", condition: "Thunderstorm" },
  ];
  for (const { min, max, symbol, condition } of cases) {
    assert.deepEqual(getWeatherPresentation(min), { symbol, condition });
    assert.deepEqual(getWeatherPresentation(max), { symbol, condition });
  }
});

test("unknown weather codes preserve the existing unavailable label and icon fallback", () => {
  for (const code of [null, -1, 4, 44, 49, 50]) {
    assert.deepEqual(getWeatherPresentation(code), { symbol: "cloud", condition: "Weather unavailable" });
  }
  for (const code of [58, 68, 78, 83, 87, 94]) {
    assert.deepEqual(getWeatherPresentation(code), { symbol: "rain", condition: "Weather unavailable" });
  }
});
