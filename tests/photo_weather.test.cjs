const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
const sceneSource = read('launcher/js/photo-weather.js');

function setup(setting, reading) {
  let suspended = 0, saved = 0, visible = 0;
  const timers = [];
  const layer = {
    hidden: true,
    style: { backgroundImage: '' },
    className: 'weather-photo'
  };
  const settings = { weatherPhoto: setting, save() { saved++; } };
  const A = {
    settings,
    applyBackground() { visible++; },
    photoWeather: null
  };
  const doc = {
    hidden: false,
    body: { classList: { contains() { return false; } } },
    getElementById(name) {
      return name === 'weather-photo' ? layer : null;
    }
  };
  const context = {
    window: {
      AeroTizen: A,
      Backgrounds: { suspend() { suspended++; } },
      Weather: { currentReading() { return reading; }, updateVisibility() { visible++; } }
    },
    document: doc,
    setInterval(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    Date, isFinite
  };
  vm.runInNewContext(sceneSource, context);
  return { A, layer, doc, timers, context,
    get suspended() { return suspended; },
    get saved() { return saved; },
    get visible() { return visible; }
  };
}
function day(code, at, opts = {}) {
  return { code, day: 1, at, solar: [], ...opts };
}

test('disabled by default and does not change the original background', () => {
  const h = setup(false, day(0, Date.now()));
  assert.equal(h.A.photoWeather.update(), false);
  assert.equal(h.layer.hidden, true);
  assert.equal(h.suspended, 0);
});

test('nine built-in scene types match the original reference', () => {
  const h = setup(true, null);
  const fn = h.A.photoWeather.sceneFor;
  const now = Date.now();
  const expected = [[0,'sun'],[2,'partly'],[3,'cloud'],
    [45,'fog'],[61,'rain'],[73,'snow'],[95,'storm']];
  expected.forEach(([code, scene]) => {
    assert.equal(fn(day(code,now),now),scene);
  });
  assert.equal(fn(day(95,now,{day:0}),now),'night');
});

test('sunset and solar phases use UTC milliseconds independent of TV time zone', () => {
  const h = setup(true, null);
  const at = Date.parse('2026-10-24T10:00:00Z');
  const rise = Date.parse('2026-10-24T06:00:00Z');
  const set = Date.parse('2026-10-24T17:00:00Z');
  const data = day(0, at, { solar: [{ sunrise:rise, sunset:set }] });
  assert.equal(h.A.photoWeather.sceneFor(data, Date.parse('2026-10-24T16:30:00Z')), 'sunset');
  assert.equal(h.A.photoWeather.sceneFor(data, Date.parse('2026-10-24T17:30:00Z')), 'night');
  assert.equal(h.A.photoWeather.sceneFor(data, Date.parse('2026-10-24T12:00:00Z')), 'sun');
});

test('bad weather codes are not changed to sunset behind a storm', () => {
  const h = setup(true, null);
  const at = Date.parse('2026-10-24T10:00:00Z');
  const w = day(95, at, { solar: [{ sunrise:at-14400000, sunset:at+3600000 }] });
  assert.equal(h.A.photoWeather.sceneFor(w,at+3000000),'storm');
});

test('a static scene suspends the original background renderer', () => {
  const h = setup(true, day(61,Date.now()));
  assert.equal(h.A.photoWeather.update(),true);
  assert.equal(h.layer.hidden,false);
  assert.equal(h.suspended,1);
  assert.match(h.layer.style.backgroundImage,/assets\/weather\/rain\.jpg/);
  h.A.photoWeather.update();
  assert.equal(h.layer.style.backgroundImage,'url("assets/weather/rain.jpg")');
});

test('no cached forecast shows the previous user-selected background', () => {
  const h = setup(true,null);
  assert.equal(h.A.photoWeather.update(),false);
  assert.equal(h.layer.hidden,true);
  assert.equal(h.suspended,0);
});

test('switching photo off removes the old photo and triggers original background', () => {
  const h = setup(true,day(2,Date.now()));
  h.A.photoWeather.update();
  h.A.photoWeather.select(false);
  assert.equal(h.A.settings.weatherPhoto,false);
  assert.equal(h.saved,1);
  assert.equal(h.layer.hidden,true);
  assert.equal(h.visible,2); // background refresh + weather subscription
});

test('periodic scene check is one timer and only runs when visible', () => {
  const h = setup(true,day(0,Date.now()));
  h.A.photoWeather.start();
  h.A.photoWeather.start();
  assert.equal(h.timers.length,1);
  assert.equal(h.timers[0].ms,60000);
  h.doc.hidden=true;
  h.timers[0].fn();
  assert.equal(h.suspended,0);
  h.doc.hidden=false;
  h.timers[0].fn();
  assert.equal(h.suspended,1);
});

test('weather provider keeps polling when widget is hidden but photo is enabled', () => {
  const weather=read('launcher/js/weather.js');
  assert.match(weather,/fetch: s\.showWeather !== false \|\| s\.weatherPhoto === true/);
  assert.match(weather,/if \(!opt\.fetch\)/);
  assert.match(weather,/now\.fetch && version === requestVersion/);
  assert.match(weather,/current=temperature_2m,weather_code,is_day&daily=sunrise,sunset/);
  assert.match(weather,/currentReading: function/);
});

test('all nine original photo assets and page wiring are present', () => {
  ['sun','partly','cloud','rain','storm','snow','fog','night','sunset'].forEach(name => {
    assert.ok(fs.existsSync(path.join(__dirname,'../launcher/assets/weather',name+'.jpg')));
  });
  const html=read('launcher/index.html');
  assert.match(html,/id="weather-photo"/);
  assert.match(html,/id="weather-photo-choice"/);
  assert.match(html,/src="js\/photo-weather\.js"/);
  assert.match(html,/href="css\/photo-weather\.css"/);
  const css=read('launcher/css/photo-weather.css');
  assert.match(css,/#weather-photo\.weather-photo/);
  assert.doesNotMatch(css,/(?:-webkit-)?backdrop-filter:/);
});
