const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'launcher/js/photo-weather.js'), 'utf8');
const day = (code, at = Date.now(), extra = {}) => ({ code, day: 1, at, solar: [], ...extra });
function setup(enabled = true, reading = day(0)) {
  const images = [], timers = new Map(), events = {};
  let suspended = 0, restored = 0, id = 0, tv = false;
  const layer = { hidden: true, style: {}, className: '' };
  const settings = { weatherPhoto: enabled };
  const A = { settings, applyBackground() { restored++; } };
  const doc = { hidden: false, body: { classList: { contains() { return tv; } } },
    getElementById() { return layer; }, addEventListener(name, fn) { events[name] = fn; } };
  const context = { window: { AeroTizen: A, Backgrounds: { suspend() { suspended++; } },
    Weather: { currentReading() { return reading; } } }, document: doc, Date, isFinite,
    Image: function () { images.push(this); },
    setInterval(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearInterval(key) { timers.delete(key); } };
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
  const fn = setup().A.photoWeather.sceneFor, now = Date.now();
  for (const [code, scene] of [[0,'sun'],[1,'sun'],[2,'partly'],[3,'cloud'],[45,'fog'],[48,'fog'],
    [51,'rain'],[67,'rain'],[80,'rain'],[82,'rain'],[71,'snow'],[77,'snow'],[85,'snow'],[86,'snow'],[95,'storm'],[96,'storm'],[99,'storm'],[999,'cloud']]) {
    assert.equal(fn(day(code, now), now), scene);
    assert.equal(fn(day(code, now, {day: 0}), now), 'night');
  }
  assert.equal(fn(null, now), ''); assert.equal(fn(day(NaN), now), '');
});
test('solar epochs override stale is_day and preserve weather at sunset', () => {
  const fn = setup().A.photoWeather.sceneFor;
  const at = Date.parse('2026-10-24T10:00:00Z'), rise = at - 4*3600000, set = at + 7*3600000;
  const reading = day(0, at, {day: 0, solar: [{sunrise: rise, sunset: set}]});
  assert.equal(fn(reading, at), 'sun');
  assert.equal(fn(reading, set - 45*60000), 'sunset');
  assert.equal(fn(reading, set + 20*60000), 'night');
  assert.equal(fn({...reading, code: 95}, set), 'storm');
  assert.equal(fn({...reading, at: at - 40*3600000}, at), 'night');
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
  h.setReading(day(61)); h.A.photoWeather.update(); stale();
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
