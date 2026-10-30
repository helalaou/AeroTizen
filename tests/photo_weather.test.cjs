const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'launcher/js/photo-weather.js'), 'utf8');
const day = (code, at = Date.now(), extra = {}) => {
  const midnight = Math.floor(at / 86400000) * 86400000;
  return { code, day: 1, at, solar: [{sunrise: midnight + 6*3600000, sunset: midnight + 18*3600000}], ...extra };
};
function setup(enabled = true, reading = day(0, Date.parse('2026-10-28T12:00Z'))) {
  const images = [], timers = new Map(), events = {};
  let suspended = 0, restored = 0, id = 0, tv = false;
  const layer = { hidden: true, style: {}, className: '' };
  const settings = { weatherPhoto: enabled };
  const A = { settings, applyBackground() { restored++; } };
  const doc = { hidden: false, body: { classList: { contains() { return tv; } } },
    getElementById() { return layer; }, addEventListener(name, fn) { events[name] = fn; } };
  const context = { window: { AeroTizen: A, Backgrounds: { suspend() { suspended++; } },
    Weather: { currentReading() { return reading; } } }, document: doc, Date: class extends Date { static now() { return Date.parse('2026-10-28T12:00Z'); } }, isFinite,
    Image: function () { images.push(this); },
    setInterval(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearInterval(key) { timers.delete(key); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'launcher/js/weather.js'), 'utf8'), context);
  context.window.Weather.currentReading = () => reading;
  vm.runInNewContext(source, context);
  return { A, doc, events, timers, images, layer,
    setReading(value) { reading = value; }, setTv(value) { tv = value; },
    get suspended() { return suspended; }, get restored() { return restored; } };
}
test('off starts no timer and requests no image', () => {
  const h = setup(false); h.A.photoWeather.start();
  assert.equal(h.images.length, 0); assert.equal(h.timers.size, 0); assert.equal(h.layer.hidden, true);
});
test('WMO scenes, night priority and invalid readings', () => {
  const fn = setup().A.photoWeather.sceneFor;
  const noon = Date.parse('2026-10-28T12:00Z'), night = Date.parse('2026-10-28T23:00Z');
  for (const [code, scene] of [[0,'sun'],[1,'sun'],[2,'partly'],[3,'cloud'],[45,'fog'],[48,'fog'],
    [51,'rain'],[67,'rain'],[80,'rain'],[82,'rain'],[71,'snow'],[77,'snow'],[85,'snow'],[86,'snow'],[95,'storm'],[96,'storm'],[99,'storm'],[999,'cloud']]) {
    assert.equal(fn(day(code, noon, {day: 0}), noon), scene);
    assert.equal(fn(day(code, night, {day: 1}), night), 'night');
  }
  assert.equal(fn(null, noon), ''); assert.equal(fn(day(NaN, noon), noon), '');
});
test('solar epochs override stale is_day and preserve weather at sunset', () => {
  const fn = setup().A.photoWeather.sceneFor;
  const at = Date.parse('2026-10-24T10:00:00Z'), rise = at - 4*3600000, set = at + 7*3600000;
  const w = now => day(0, now, {day: 0, solar: [{sunrise: rise, sunset: set}]});
  assert.equal(fn(w(at), at), 'sun');
  assert.equal(fn(w(set), set - 45*60000), ''); // Future readings are not trustworthy.
  assert.equal(fn(w(set - 45*60000), set - 45*60000), 'sunset');
  assert.equal(fn(w(set + 20*60000), set + 20*60000), 'night');
  assert.equal(fn({...w(set), code: 95}, set), 'storm');
  assert.equal(fn({...w(at), at: at - 40*3600000}, at), '');
});
test('missing, malformed and expired solar fields never infer daylight from cached is_day', () => {
  const fn = setup().A.photoWeather.sceneFor, now = Date.parse('2026-10-28T23:00Z');
  const oldDay = day(0, now - 5*60000);
  for (const solar of [undefined, null, [], {}, [null], [{sunrise:null,sunset:now}],
    [{sunrise:String(now-3600000),sunset:now}], [{sunrise:now,sunset:now-1}],
    [{sunrise:now-48*3600000,sunset:now-36*3600000}],
    [{sunrise:now+24*3600000,sunset:now+36*3600000}]]) {
    assert.equal(fn({...oldDay, solar}, now), '');
  }
});
test('one selected image decodes before animation is suspended; repeated readings do not reload', () => {
  const h = setup(); assert.equal(h.A.photoWeather.update(), false);
  assert.equal(h.images.length, 1); assert.equal(h.suspended, 0);
  h.images[0].onload();
  assert.equal(h.suspended, 1); assert.equal(h.layer.hidden, false);
  assert.equal(h.A.photoWeather.update(), true); assert.equal(h.images.length, 1); assert.equal(h.suspended, 1);
});
test('changed scenes ignore stale callbacks and show only the latest image', () => {
  const h = setup(); h.A.photoWeather.update(); const stale = h.images[0].onload;
  h.setReading(day(61, Date.parse('2026-10-28T12:00Z'))); h.A.photoWeather.update(); stale();
  assert.equal(h.layer.hidden, true); h.images[1].onload();
  assert.match(h.layer.style.backgroundImage, /rain.jpg/);
});
test('disable cancels pending image and timer; late callback cannot cover the fallback', () => {
  const h = setup(); h.A.photoWeather.start(); const late = h.images[0].onload;
  h.A.settings.weatherPhoto = false; h.A.photoWeather.update(); late();
  assert.equal(h.timers.size, 0); assert.equal(h.layer.hidden, true); assert.equal(h.suspended, 0);
});
test('missing image restores fallback and does not suspend its animation', () => {
  const h = setup(); h.A.photoWeather.update(); h.images[0].onerror();
  assert.equal(h.layer.hidden, true); assert.equal(h.suspended, 0); assert.equal(h.restored, 1);
});
test('expired or changed-location reading removes previous scene', () => {
  const h = setup(); h.A.photoWeather.update(); h.images[0].onload();
  h.setReading(null); assert.equal(h.A.photoWeather.update(), false);
  assert.equal(h.layer.hidden, true); assert.equal(h.restored, 1);
});
test('only one visible enabled timer; hidden pending loads are discarded and resumed', () => {
  const h = setup(); h.A.photoWeather.start(); h.A.photoWeather.start();
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].ms, 60000);
  const late = h.images[0].onload; h.doc.hidden = true; h.events.visibilitychange(); late();
  assert.equal(h.timers.size, 0); assert.equal(h.layer.hidden, true);
  h.doc.hidden = false; h.events.visibilitychange();
  assert.equal(h.timers.size, 1); assert.equal(h.images.length, 2); h.images[1].onload();
  h.setTv(true); assert.equal(h.A.photoWeather.update(), false); assert.equal(h.layer.hidden, true);
});
test('all nine optimized images match the provenance manifest and Full HD JPEG size budget', () => {
  const dir = path.join(root, 'launcher/assets/weather');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir,'MANIFEST.json')));
  assert.equal(manifest.assets.length, 9);
  let total = 0;
  for (const item of manifest.assets) {
    const bytes = fs.readFileSync(path.join(dir,item.file)); total += bytes.length;
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(bytes.length, item.bytes); assert(bytes.length < 400000);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    const sof = bytes.indexOf(Buffer.from([0xff, 0xc0])); assert(sof > 0, 'baseline JPEG');
    assert.equal(bytes.readUInt16BE(sof+5), 1080); assert.equal(bytes.readUInt16BE(sof+7), 1920);
  }
  assert(total < 2600000);
});
