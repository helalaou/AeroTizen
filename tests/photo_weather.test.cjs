const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createWeatherPhoto, weatherPhotoScene } = loadTypeScript("launcher/src/backgrounds/createWeatherPhoto.ts");
const day = (code, at = Date.now(), extra = {}) => {
  const midnight = Math.floor(at / 86400000) * 86400000;
  return {
    code,
    day: 1,
    at,
    solar: [{ sunrise: midnight + 6 * 3600000, sunset: midnight + 18 * 3600000 }],
    ...extra,
  };
};
function setup(initiallyEnabled = true, reading = day(0, Date.parse("2026-10-28T12:00Z"))) {
  const images = [],
    timers = new Map(),
    events = {};
  let id = 0,
    enabled = initiallyEnabled,
    watching = false;
  const doc = {
    hidden: false,
    addEventListener(name, fn) {
      events[name] = fn;
    },
    removeEventListener(name) {
      delete events[name];
    },
  };
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "launcher/js/weather.js"), "utf8"), context);
  const weather = context.window.Weather;
  weather.currentReading = () => reading;
  const photo = createWeatherPhoto(weather, () => enabled && !watching, {
    document: doc,
    Date: { now: () => Date.parse("2026-10-28T12:00Z") },
    Image: function () {
      images.push(this);
    },
    setInterval(fn, ms) {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearInterval(key) {
      timers.delete(key);
    },
  });
  const displayed = [];
  photo.subscribe(() => displayed.push(photo.getSnapshot()));
  return {
    photo,
    displayed,
    sceneFor: (reading, now) => weatherPhotoScene(reading, weather.solarPhase(reading, now)),
    doc,
    events,
    timers,
    images,
    setReading(value) {
      reading = value;
    },
    setEnabled(value) {
      enabled = value;
    },
    setWatching(value) {
      watching = value;
    },
    publish: weather.updateDisplay,
    get scene() {
      return photo.getSnapshot();
    },
  };
}
test("off starts no timer and requests no image", () => {
  const h = setup(false);
  h.photo.update();
  assert.equal(h.images.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.scene, null);
});
test("WMO scenes, night priority and invalid readings", () => {
  const fn = setup().sceneFor;
  const noon = Date.parse("2026-10-28T12:00Z"),
    night = Date.parse("2026-10-28T23:00Z");
  for (const [code, scene] of [
    [0, "sun"],
    [1, "sun"],
    [2, "partly"],
    [3, "cloud"],
    [45, "fog"],
    [48, "fog"],
    [51, "rain"],
    [59, "rain"],
    [67, "rain"],
    [68, "cloud"],
    [80, "rain"],
    [82, "rain"],
    [71, "snow"],
    [77, "snow"],
    [85, "snow"],
    [86, "snow"],
    [95, "storm"],
    [96, "storm"],
    [97, "cloud"],
    [99, "storm"],
    [999, "cloud"],
  ]) {
    assert.equal(fn(day(code, noon, { day: 0 }), noon), scene);
    assert.equal(fn(day(code, night, { day: 1 }), night), "night");
  }
  assert.equal(fn(null, noon), null);
  assert.equal(fn(day(NaN, noon), noon), null);
});
test("solar epochs override stale is_day and preserve weather at sunset", () => {
  const fn = setup().sceneFor;
  const at = Date.parse("2026-10-24T10:00:00Z"),
    rise = at - 4 * 3600000,
    set = at + 7 * 3600000;
  const w = (now) => day(0, now, { day: 0, solar: [{ sunrise: rise, sunset: set }] });
  assert.equal(fn(w(at), at), "sun");
  assert.equal(fn(w(set), set - 45 * 60000), null); // Future readings are not trustworthy.
  assert.equal(fn(w(set - 45 * 60000), set - 45 * 60000), "sunset");
  assert.equal(fn(w(set + 20 * 60000), set + 20 * 60000), "night");
  assert.equal(fn({ ...w(set), code: 95 }, set), "storm");
  assert.equal(fn({ ...w(at), at: at - 40 * 3600000 }, at), null);
});
test("missing, malformed and expired solar fields never infer daylight from cached is_day", () => {
  const fn = setup().sceneFor,
    now = Date.parse("2026-10-28T23:00Z");
  const oldDay = day(0, now - 5 * 60000);
  for (const solar of [
    undefined,
    null,
    [],
    {},
    [null],
    [{ sunrise: null, sunset: now }],
    [{ sunrise: String(now - 3600000), sunset: now }],
    [{ sunrise: now, sunset: now - 1 }],
    [{ sunrise: now - 48 * 3600000, sunset: now - 36 * 3600000 }],
    [{ sunrise: now + 24 * 3600000, sunset: now + 36 * 3600000 }],
  ]) {
    assert.equal(fn({ ...oldDay, solar }, now), null);
  }
});
test("only a loaded image is published and repeated readings do not request it again", () => {
  const h = setup();
  h.photo.update();
  assert.equal(h.images.length, 1);
  assert.deepEqual(h.displayed, []);
  h.images[0].onload();
  assert.equal(h.scene, "sun");
  h.photo.update();
  assert.equal(h.images.length, 1);
  assert.deepEqual(h.displayed, ["sun"]);
});
test("changed scenes ignore stale callbacks and show only the latest image", () => {
  const h = setup();
  h.photo.update();
  const stale = h.images[0].onload;
  h.setReading(day(61, Date.parse("2026-10-28T12:00Z")));
  h.photo.update();
  stale();
  assert.equal(h.scene, null);
  h.images[1].onload();
  assert.equal(h.scene, "rain");
});
test("disable cancels pending image and timer; late callback cannot cover the fallback", () => {
  const h = setup();
  h.photo.update();
  const late = h.images[0].onload;
  h.setEnabled(false);
  h.photo.update();
  late();
  assert.equal(h.timers.size, 0);
  assert.equal(h.scene, null);
  assert.deepEqual(h.displayed, []);
});
test("a failed image is never published or requested again for the same reading", () => {
  const h = setup();
  h.photo.update();
  h.images[0].onerror();
  assert.equal(h.scene, null);
  assert.deepEqual(h.displayed, []);
  h.photo.update();
  assert.equal(h.images.length, 1);
});
test("expired or changed-location reading removes previous scene", () => {
  const h = setup();
  h.photo.update();
  h.images[0].onload();
  h.setReading(null);
  h.publish();
  assert.equal(h.scene, null);
  assert.deepEqual(h.displayed, ["sun", null]);
});
test("only one visible enabled timer; hidden pending loads are discarded and resumed", () => {
  const h = setup();
  h.photo.update();
  h.photo.update();
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, 60000);
  const late = h.images[0].onload;
  h.doc.hidden = true;
  h.events.visibilitychange();
  late();
  assert.equal(h.timers.size, 0);
  assert.equal(h.scene, null);
  h.doc.hidden = false;
  h.events.visibilitychange();
  assert.equal(h.timers.size, 1);
  assert.equal(h.images.length, 2);
  h.images[1].onload();
  h.setWatching(true);
  h.photo.update();
  assert.equal(h.scene, null);
});
test("disposing the photo controller removes its timer and listeners and ignores in-flight images", () => {
  const h = setup();
  h.photo.update();
  const late = h.images[0].onload;
  h.photo.dispose();
  late();
  h.publish();
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.visibilitychange, undefined);
  assert.equal(h.images.length, 1);
  assert.equal(h.scene, null);
});
test("all nine optimized images match the provenance manifest and Full HD JPEG size budget", () => {
  const dir = path.join(root, "launcher/assets/weather");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json")));
  assert.equal(manifest.assets.length, 9);
  let total = 0;
  for (const item of manifest.assets) {
    const bytes = fs.readFileSync(path.join(dir, item.file));
    total += bytes.length;
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), item.sha256);
    assert.equal(bytes.length, item.bytes);
    assert(bytes.length < 400000);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    const sof = bytes.indexOf(Buffer.from([0xff, 0xc0]));
    assert(sof > 0, "baseline JPEG");
    assert.equal(bytes.readUInt16BE(sof + 5), 1080);
    assert.equal(bytes.readUInt16BE(sof + 7), 1920);
  }
  assert(total < 2600000);
});
