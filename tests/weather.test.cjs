const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'launcher/js/weather.js'), 'utf8');
const CACHE = 'aerotizen.weather.v2';
const NOW = 1800000000000;
const london = { name: 'London', label: 'London, England, United Kingdom', latitude: 51.5085, longitude: -0.1257, country_code: 'GB' };
const boston = { name: 'Boston', latitude: 42.3584, longitude: -71.0598, country_code: 'US' };
const conditions = (temp = 12) => ({ current: { temperature_2m: temp, weather_code: 3 } });

function harness({ saved, settings = {}, blockedStorage = false, now = NOW } = {}) {
  const requests = [], intervals = new Map(), storage = new Map();
  let clock = now, timerId = 0;
  if (saved !== undefined) { storage.set(CACHE, typeof saved === 'string' ? saved : JSON.stringify(saved)); }
  const preferences = { tempUnit: 'C', weatherLocation: null, weatherShowLocation: true, ...settings };
  const el = {
    hidden: true, nodes: {},
    set innerHTML(html) {
      this.html = html;
      this.nodes = { b: { textContent: '' } };
      if (html.includes('<span>')) { this.nodes.span = { textContent: '' }; }
    },
    set textContent(value) { this.html = value; this.nodes = {}; },
    querySelector(selector) { return this.nodes[selector] || null; }
  };
  class FakeXHR {
    open(method, url) { this.url = url; }
    send() { requests.push(this); }
    abort() { this.aborted = true; this.onabort(); }
    respond(data, status = 200) {
      this.status = status;
      this.responseText = typeof data === 'string' ? data : JSON.stringify(data);
      this.onload();
    }
  }
  const context = vm.createContext({
    window: {}, document: { getElementById: () => el }, XMLHttpRequest: FakeXHR,
    Date: class extends Date { static now() { return clock; } },
    localStorage: {
      getItem(key) { if (blockedStorage) { throw new Error('Storage blocked'); } return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) { throw new Error('Storage blocked'); } storage.set(key, value); }
    },
    setInterval(fn, ms) { intervals.set(++timerId, { fn, ms }); return timerId; },
    clearInterval(id) { intervals.delete(id); }
  });
  vm.runInContext(source, context);
  const weather = context.window.Weather;
  return {
    weather, preferences, requests, el, storage, intervals, context,
    start: () => weather.start(() => preferences),
    advance(ms) { clock += ms; },
    cached: () => JSON.parse(storage.get(CACHE))
  };
}

function cached(overrides = {}) {
  return { temp: 12, code: 3, city: 'London', unit: 'C', source: 'auto', at: NOW, ...overrides };
}

test('automatic location uses IP coordinates for the forecast', () => {
  const h = harness(); h.start();
  assert.equal(h.requests[0].url, 'https://ipapi.co/json/');
  h.requests[0].respond({ city: 'London', latitude: 51.5, longitude: -0.12, country_code: 'GB' });
  const url = new URL(h.requests[1].url);
  assert.equal(url.searchParams.get('latitude'), '51.5');
  assert.equal(url.searchParams.get('longitude'), '-0.12');
  h.requests[1].respond(conditions());
  assert.equal(h.el.hidden, false);
  assert.equal(h.el.nodes.b.textContent, '12°');
  assert.equal(h.el.nodes.span.textContent, 'London');
});

test('saved location bypasses IP lookup and retains its chosen coordinates', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].url);
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), String(london.latitude));
  assert.equal(url.searchParams.get('longitude'), String(london.longitude));
  h.requests[0].respond(conditions());
  assert.equal(h.el.nodes.span.textContent, 'London');
});

test('hide location removes the name and preserves temperature and icon without fetching', () => {
  const h = harness({ saved: cached() }); h.start();
  h.preferences.weatherShowLocation = false;
  h.weather.updateDisplay();
  assert.equal(h.el.hidden, false);
  assert.equal(h.el.nodes.b.textContent, '12°');
  assert.ok(h.el.html.includes('<svg'));
  assert.equal(h.el.querySelector('span'), null);
  assert.equal(h.requests.length, 0);
  h.preferences.weatherShowLocation = true;
  h.weather.updateDisplay();
  assert.equal(h.el.nodes.span.textContent, 'London');
});

test('hidden location stays hidden when cached weather loads and when requests complete', () => {
  const h = harness({ saved: cached(), settings: { weatherShowLocation: false, weatherLocation: london } });
  h.start(); h.requests[0].respond(conditions());
  assert.equal(h.el.querySelector('span'), null);
  const reboot = harness({ saved: h.cached(), settings: h.preferences }); reboot.start();
  assert.equal(reboot.requests.length, 0);
  assert.equal(reboot.el.querySelector('span'), null);
  assert.equal(reboot.el.nodes.b.textContent, '12°');
});

test('changing location clears the old reading and ignores an old forecast response', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  const old = h.requests[0];
  old.respond(conditions());
  h.weather.refresh();
  const delayed = h.requests[1];
  h.preferences.weatherLocation = boston;
  h.weather.refresh();
  assert.equal(h.el.hidden, true);
  h.requests[2].respond(conditions(55));
  delayed.respond(conditions(1));
  assert.equal(h.el.nodes.b.textContent, '55°');
  assert.equal(h.el.nodes.span.textContent, 'Boston');
  assert.equal(h.cached().city, 'Boston');
});

test('an old IP response cannot replace a newly selected location', () => {
  const h = harness(); h.start();
  const ip = h.requests[0];
  h.preferences.weatherLocation = london;
  h.weather.refresh();
  ip.respond({ city: 'Wrong city', latitude: 1, longitude: 1, country_code: 'US' });
  assert.equal(h.requests.length, 2);
  h.requests[1].respond(conditions());
  assert.equal(h.el.nodes.span.textContent, 'London');
});

test('switching back to automatic location makes a fresh IP lookup', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  h.requests[0].respond(conditions());
  h.preferences.weatherLocation = null; h.weather.refresh();
  assert.equal(h.el.hidden, true);
  assert.equal(h.requests[1].url, 'https://ipapi.co/json/');
});

test('explicit units override the selected country', () => {
  for (const [unit, country, fahrenheit] of [['auto', 'US', false], ['auto', 'LR', false], ['auto', 'MM', false],
    ['auto', 'GB', false], ['C', 'US', false], ['F', 'GB', true]]) {
    const h = harness({ settings: { weatherLocation: { ...london, country_code: country }, tempUnit: unit } });
    h.start();
    assert.equal(new URL(h.requests[0].url).searchParams.get('temperature_unit') === 'fahrenheit', fahrenheit);
  }
});

test('unit changes convert the old value and discard its pending request', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  h.requests[0].respond(conditions());
  h.weather.refresh();
  const delayed = h.requests[1];
  h.preferences.tempUnit = 'F'; h.weather.refresh();
  assert.equal(h.el.hidden, false);
  assert.equal(h.el.nodes.b.textContent, '54°');
  h.requests[2].respond(conditions(54));
  delayed.respond(conditions(12));
  assert.equal(h.el.nodes.b.textContent, '54°');
});

test('matching cache avoids requests, other units convert and wrong locations hide', () => {
  const h = harness({ saved: cached() }); h.start();
  assert.equal(h.requests.length, 0);
  assert.equal(h.el.hidden, false);
  for (const settings of [{ tempUnit: 'F' }, { weatherLocation: london }]) {
    const changed = harness({ saved: cached(), settings }); changed.start();
    assert.equal(changed.el.hidden, !!settings.weatherLocation);
    if (settings.tempUnit === 'F') { assert.equal(changed.el.nodes.b.textContent, '54°'); }
    assert.equal(changed.requests.length, 1);
  }
});

test('old, future, corrupt and malformed cached weather cannot appear', () => {
  for (const saved of [cached({ at: NOW - 3 * 3600000 }), cached({ at: NOW + 1 }), cached({ temp: null }),
    cached({ code: null }), cached({ at: null }), '{invalid', { temp: 12 }, []]) {
    const h = harness({ saved }); h.start();
    assert.equal(h.el.hidden, true);
    assert.equal(h.requests.length, 1);
  }
});

test('recent cached weather remains through an outage and expires after two hours', () => {
  const h = harness({ saved: cached({ at: NOW - 30 * 60000 }) }); h.start();
  assert.equal(h.el.hidden, false);
  h.requests[0].ontimeout();
  assert.equal(h.el.hidden, false);
  h.advance(2 * 3600000);
  h.weather.refresh();
  assert.equal(h.el.hidden, true);
});

test('bad IP coordinates do not make a forecast request; zero is a valid coordinate', () => {
  for (const geo of [{ latitude: null, longitude: 1 }, { latitude: 51 }, { latitude: '51', longitude: -1 },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { error: true, latitude: 1, longitude: 1 }]) {
    const h = harness(); h.start(); h.requests[0].respond(geo);
    assert.equal(h.requests.length, 1);
    assert.equal(h.el.hidden, true);
  }
  const h = harness(); h.start(); h.requests[0].respond({ latitude: 0, longitude: 0 });
  assert.equal(h.requests.length, 2);
});

test('invalid forecasts and failed requests do not replace a valid reading', () => {
  for (const data of [{ current: { temperature_2m: null, weather_code: 3 } },
    { current: { temperature_2m: 12, weather_code: null } }, { error: true }, 'invalid JSON']) {
    const h = harness({ settings: { weatherLocation: london } }); h.start();
    h.requests[0].respond(conditions()); h.weather.refresh(); h.requests[1].respond(data);
    assert.equal(h.el.nodes.b.textContent, '12°');
  }
});

test('location search encodes queries and returns distinct labels and validated coordinates', () => {
  const h = harness();
  let found;
  h.weather.searchLocations('  Paris, France & region  ', result => { found = result; });
  assert.equal(new URL(h.requests[0].url).searchParams.get('name'), 'Paris, France & region');
  h.requests[0].respond({ results: [{ ...london, admin1: 'England', admin2: 'Greater London', country: 'United Kingdom' },
    { ...london, latitude: null }, { ...london, name: '' }] });
  assert.equal(found.length, 1);
  assert.equal(found[0].label, 'London, Greater London, England, United Kingdom');
  assert.equal(found[0].latitude, london.latitude);
  assert.equal(found[0].country_code, 'GB');
});

test('location search distinguishes no matches from service or network failures', () => {
  for (const [data, status, expected] of [[{}, 200, 'empty'], [{ results: [] }, 200, 'empty'],
    [{ error: true }, 200, 'error'], [{ results: {} }, 200, 'error'], ['invalid JSON', 200, 'error'], [{}, 429, 'error']]) {
    const h = harness(); let result;
    h.weather.searchLocations('London', value => { result = value; });
    h.requests[0].respond(data, status);
    assert.equal(expected === 'error' ? result === null : result.length === 0, true);
  }
  const h = harness(); let count = 0;
  h.weather.searchLocations('London', value => { assert.equal(value, null); count++; });
  h.requests[0].ontimeout(); h.requests[0].onerror();
  assert.equal(count, 1);
});

test('a short search makes no network request', () => {
  const h = harness(); let found;
  h.weather.searchLocations(' x ', value => { found = value; });
  assert.equal(found.length, 0);
  assert.equal(h.requests.length, 0);
});

test('blocked storage does not prevent weather; repeated start keeps one refresh timer', () => {
  const h = harness({ settings: { weatherLocation: london }, blockedStorage: true }); h.start();
  h.requests[0].respond(conditions());
  assert.equal(h.el.hidden, false);
  h.start();
  assert.equal(h.intervals.size, 1);
  assert.equal([...h.intervals.values()][0].ms, 20 * 60000);
});

test('weather off at startup hides fresh or stale cache and makes no automatic requests', () => {
  for (const saved of [undefined, cached(), cached({ at: NOW - 30 * 60000 }), cached({ unit: 'F' }), cached({ unit: 'auto' })]) {
    const h = harness({ saved, settings: { showWeather: false } }); h.start();
    assert.equal(h.el.hidden, true);
    assert.equal(h.el.html, '');
    assert.equal(h.requests.length, 0);
    assert.equal(h.intervals.size, 0);
    if (saved) { assert.deepEqual(h.cached(), saved); }
  }
});

test('hiding weather removes it at once and restores matching cache with saved preferences', () => {
  const saved = cached({ unit: 'F', source: JSON.stringify([london.latitude, london.longitude, london.name, london.country_code]) });
  const h = harness({ saved, settings: { weatherLocation: london, tempUnit: 'F', weatherShowLocation: false } });
  h.start();
  const queuedRefresh = [...h.intervals.values()][0].fn;
  h.preferences.showWeather = false; h.weather.updateVisibility();
  assert.equal(h.el.hidden, true);
  assert.equal(h.el.html, '');
  assert.equal(h.intervals.size, 0);
  queuedRefresh();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.cached(), saved);
  assert.equal(h.preferences.weatherLocation, london);
  assert.equal(h.preferences.tempUnit, 'F');
  h.preferences.showWeather = true; h.weather.updateVisibility();
  assert.equal(h.el.hidden, false);
  assert.equal(h.el.nodes.b.textContent, '12°');
  assert.equal(h.el.querySelector('span'), null);
  assert.equal(h.requests.length, 0);
  assert.equal(h.intervals.size, 1);
});

test('hiding weather aborts pending IP lookup and a late response cannot start a forecast', () => {
  const h = harness(); h.start();
  const ip = h.requests[0];
  h.preferences.showWeather = false; h.weather.updateVisibility();
  assert.equal(ip.aborted, true);
  ip.respond({ city: 'London', latitude: 51.5, longitude: -0.12, country_code: 'GB' });
  assert.equal(h.requests.length, 1);
  assert.equal(h.el.hidden, true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.storage.has(CACHE), false);
});

test('hiding weather aborts pending forecast and a late response cannot replace its cache', () => {
  const saved = cached({ at: NOW - 30 * 60000 });
  const h = harness({ saved }); h.start();
  h.requests[0].respond({ city: 'London', latitude: 51.5, longitude: -0.12, country_code: 'GB' });
  const forecast = h.requests[1];
  h.preferences.showWeather = false; h.weather.updateVisibility();
  assert.equal(forecast.aborted, true);
  forecast.respond(conditions(99));
  assert.equal(h.el.hidden, true);
  assert.equal(h.intervals.size, 0);
  assert.deepEqual(h.cached(), saved);
});

test('an IP response from before off/on cannot start another forecast after weather resumes', () => {
  const h = harness(); h.start();
  const oldIP = h.requests[0];
  h.preferences.showWeather = false; h.weather.updateVisibility();
  h.preferences.showWeather = true; h.weather.updateVisibility();
  assert.equal(h.requests.length, 2);
  oldIP.respond({ city: 'Wrong city', latitude: 1, longitude: 1 });
  assert.equal(h.requests.length, 2);
  h.requests[1].respond({ city: 'London', latitude: 51.5, longitude: -0.12, country_code: 'GB' });
  h.requests[2].respond(conditions());
  assert.equal(h.el.nodes.span.textContent, 'London');
  assert.equal(h.cached().city, 'London');
  assert.equal(h.intervals.size, 1);
});

test('a forecast from before off/on cannot replace the resumed forecast or cache', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  const oldForecast = h.requests[0];
  h.preferences.showWeather = false; h.weather.updateVisibility();
  h.preferences.showWeather = true; h.weather.updateVisibility();
  h.requests[1].respond(conditions(15));
  oldForecast.respond(conditions(99));
  assert.equal(h.el.hidden, false);
  assert.equal(h.el.nodes.b.textContent, '15°');
  assert.equal(h.cached().temp, 15);
  assert.equal(h.intervals.size, 1);
});

test('refresh and location or unit changes while off do not request data; resume uses current settings', () => {
  const saved = cached();
  const h = harness({ saved, settings: { showWeather: false } }); h.start();
  h.weather.refresh();
  h.preferences.tempUnit = 'F'; h.weather.refresh();
  h.preferences.weatherLocation = boston; h.weather.refresh();
  h.preferences.weatherShowLocation = false; h.weather.updateDisplay();
  assert.equal(h.requests.length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.el.hidden, true);
  assert.deepEqual(h.cached(), saved);
  h.preferences.showWeather = true; h.weather.updateVisibility();
  assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].url);
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), String(boston.latitude));
  assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
  h.requests[0].respond(conditions(55));
  assert.equal(h.el.nodes.b.textContent, '55°');
  assert.equal(h.el.querySelector('span'), null);
});

test('resume refreshes stale cache and repeated visibility updates keep one timer and request', () => {
  const h = harness({ saved: cached(), settings: { showWeather: false } }); h.start();
  h.advance(21 * 60000);
  h.preferences.showWeather = true;
  h.weather.updateVisibility(); h.weather.updateVisibility(); h.weather.updateVisibility();
  assert.equal(h.el.hidden, false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.intervals.size, 1);
  assert.equal([...h.intervals.values()][0].ms, 20 * 60000);
  for (let i = 0; i < 3; i++) {
    h.preferences.showWeather = false; h.weather.updateVisibility();
    assert.equal(h.intervals.size, 0);
    h.preferences.showWeather = true; h.weather.updateVisibility();
    assert.equal(h.intervals.size, 1);
  }
  assert.equal(h.requests.slice(0, -1).every(request => request.aborted), true);
});

test('resume converts fresh cache after a unit change while off and fetches the selected scale', () => {
  for (const [oldUnit, oldTemp, newUnit, newTemp] of [['C', 10, 'F', 50], ['F', 50, 'C', 10]]) {
    const saved = cached({ unit: oldUnit, temp: oldTemp });
    const h = harness({ saved, settings: { tempUnit: oldUnit } }); h.start();
    h.preferences.showWeather = false; h.weather.updateVisibility();
    h.preferences.tempUnit = newUnit; h.weather.refresh();
    assert.equal(h.requests.length, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.el.hidden, true);
    assert.deepEqual(h.cached(), saved);
    h.preferences.showWeather = true; h.weather.updateVisibility(); h.weather.updateVisibility();
    assert.equal(h.el.nodes.b.textContent, newTemp + '°');
    assert.equal(h.requests.length, 1);
    assert.equal(h.intervals.size, 1);
    assert.deepEqual(h.cached(), saved);
    h.requests[0].respond({ latitude: 51.5, longitude: -0.12, city: 'London', country_code: 'GB' });
    assert.equal(new URL(h.requests[1].url).searchParams.get('temperature_unit') === 'fahrenheit', newUnit === 'F');
    h.requests[1].respond(conditions(newTemp));
    assert.equal(h.cached().unit, newUnit);
    assert.equal(h.el.nodes.b.textContent, newTemp + '°');
  }
});

test('visibility guards reject automatic responses even before the visibility handler runs', () => {
  for (const settings of [{}, { weatherLocation: london }]) {
    const h = harness({ settings }); h.start();
    h.preferences.showWeather = false;
    h.requests[0].respond(settings.weatherLocation ? conditions(99) : london);
    h.weather.updateDisplay();
    assert.equal(h.requests.length, 1);
    assert.equal(h.el.hidden, true);
    assert.equal(h.storage.has(CACHE), false);
  }
});

test('explicit location search remains available while off and is not canceled by hiding weather', () => {
  const h = harness({ settings: { showWeather: false } }); h.start();
  let found;
  h.weather.searchLocations('London', value => { found = value; });
  h.weather.updateVisibility();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].aborted, undefined);
  h.requests[0].respond({ results: [london] });
  assert.equal(found[0].name, 'London');
  assert.equal(h.el.hidden, true);
  assert.equal(h.intervals.size, 0);
});

test('old preferences keep the default visibility; location and visibility persist on save', () => {
  const data = new Map([['aerotizen.settings.v1', JSON.stringify({ tempUnit: 'C', background: 'aurora' })]]);
  const context = vm.createContext({ window: {}, localStorage: {
    getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)
  } });
  context.AeroTizen = context.window.AeroTizen = {};
  for (const file of ['config.js', 'settings.js', 'clock.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'launcher/js', file), 'utf8'), context);
  }
  const settings = context.AeroTizen.settings;
  settings.load();
  assert.equal(settings.weatherShowLocation, true);
  assert.equal(settings.weatherLocation, null);
  settings.weatherLocation = london; settings.weatherShowLocation = false; settings.save();
  settings.weatherLocation = null; settings.weatherShowLocation = true; settings.load();
  assert.equal(settings.weatherLocation.name, 'London');
  assert.equal(settings.weatherShowLocation, false);
  assert.equal(settings.tempUnit, 'C');
});


function preferences({ locale = 'en-GB', intl = Intl, saved = {}, legacy = false } = {}) {
  const storage = new Map([[legacy ? 'hearth.home.v1' : 'aerotizen.settings.v1', JSON.stringify(saved)]]);
  const A = {};
  const context = vm.createContext({
    AeroTizen: A, window: { AeroTizen: A, navigator: { languages: [locale], language: locale }, Intl: intl },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  });
  for (const file of ['config.js', 'settings.js', 'clock.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'launcher/js', file), 'utf8'), context);
  }
  A.settings.load();
  return { A, storage, context };
}

test('temperature defaults follow regional weather conventions, including non-US Fahrenheit regions',()=>{
  for(const [locale,unit] of [
    ['en-GB','C'],['en-US','F'],['es-US','F'],['fr-CA','C'],['en-AU','C'],['de-DE','C'],
    ['en-BS','F'],['en-BZ','F'],['en-KY','F'],['es-PR','F'],['en-PW','F'],
    ['en-LR','C'],['my-MM','C'],['ar-EG','C'],['fa-IR','C'],['hi-IN','C'],['ja-JP','C'],['zh-TW','C']
  ]) {
    const {A,storage}=preferences({locale});
    assert.equal(A.settings.tempUnit,unit,locale);
    assert.equal(JSON.parse(storage.get(A.config.STORAGE_KEY)).tempUnit,unit);
  }
});

test('explicit locale temperature and regional overrides take precedence',()=>{
  for(const [locale,unit] of [
    ['en-US-u-mu-celsius','C'],['en-GB-u-mu-fahrenhe','F'],
    ['fr-CA-u-rg-uszzzz','F'],['en-US-u-rg-gbzzzz','C'],
    ['en-US-u-rg-gbzzzz-mu-fahrenhe','F'],['es-Latn-US','F'],
    ['en-US-x-u-mu-celsius','F']
  ]) { assert.equal(preferences({locale}).A.settings.tempUnit,unit,locale); }
});

test('older browsers can read explicit regions without Intl',()=>{
  assert.equal(preferences({locale:'en-US',intl:null}).A.settings.tempUnit,'F');
  assert.equal(preferences({locale:'en-GB',intl:null}).A.settings.tempUnit,'C');
  assert.equal(preferences({locale:'unknown',intl:null}).A.settings.tempUnit,'C');
});

test('Automatic and invalid values migrate once, while saved manual choices remain',()=>{
  for(const legacy of [false,true]) {
    for(const [previous,expected] of [['auto','C'],[null,'C'],['invalid','C'],['F','F'],['C','C']]) {
      const {A,storage,context}=preferences({legacy,saved:{tempUnit:previous}});
      assert.equal(A.settings.tempUnit,expected);
      A.settings.save();
      assert.equal(JSON.parse(storage.get(A.config.STORAGE_KEY)).tempUnit,expected);
      context.window.navigator.languages=['en-US'];
      context.window.navigator.language='en-US';
      A.settings.load();
      assert.equal(A.settings.tempUnit,expected);
    }
  }
});


test('IP country cannot change either explicit temperature scale', () => {
  for (const [unit, temp] of [['C', 10], ['F', 50]]) {
    const h = harness({ settings: { tempUnit: unit } }); h.start();
    h.requests[0].respond({ latitude: 0, longitude: 0, country_code: unit === 'C' ? 'US' : 'GB' });
    assert.equal(new URL(h.requests[1].url).searchParams.get('temperature_unit') === 'fahrenheit', unit === 'F');
    h.requests[1].respond(conditions(temp));
    assert.equal(h.el.nodes.b.textContent, temp + '°');
    assert.equal(h.cached().unit, unit);
  }
});

test('unit switches convert cached weather both ways through an outage', () => {
  const h = harness({ saved: cached({ temp: 10 }) }); h.start();
  h.preferences.tempUnit = 'F'; h.weather.refresh();
  assert.equal(h.el.nodes.b.textContent, '50°');
  h.requests[0].onerror();
  assert.equal(h.el.nodes.b.textContent, '50°');
  h.preferences.tempUnit = 'C'; h.weather.refresh();
  assert.equal(h.el.nodes.b.textContent, '10°');
});

test('Celsius converts a stored Fahrenheit reading before a fresh response', () => {
  const h = harness({ saved: cached({ unit: 'F', temp: 50 }) }); h.start();
  assert.equal(h.el.nodes.b.textContent, '10°');
  assert.equal(h.requests.length, 1);
  assert.equal(h.cached().unit, 'F');
});

test('legacy Automatic and invalid cache units cannot appear', () => {
  for (const unit of ['auto', null, 'invalid']) {
    const h = harness({ saved: cached({ unit, temp: 50 }) }); h.start();
    assert.equal(h.el.hidden, true);
    h.requests[0].respond({ latitude: 0, longitude: 0, country_code: 'US' });
    h.requests[1].respond(conditions(10));
    assert.equal(h.el.nodes.b.textContent, '10°');
    assert.equal(h.cached().unit, 'C');
  }
});

test('zero is a valid temperature and null cannot appear as zero', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  h.requests[0].respond(conditions(null));
  assert.equal(h.el.hidden, true);
  h.weather.refresh(); h.requests[1].respond(conditions(0));
  assert.equal(h.el.nodes.b.textContent, '0°');
});

test('wallpaper is a weather consumer even when the widget is hidden; turning both off aborts polling', () => {
  const h = harness({ settings: { showWeather: false, weatherPhoto: true, weatherLocation: london } });
  h.start(); assert.equal(h.requests.length, 1); assert.equal(h.el.hidden, true);
  const url = new URL(h.requests[0].url);
  assert.equal(url.searchParams.get('daily'), 'sunrise,sunset');
  assert.equal(url.searchParams.get('timezone'), 'UTC');
  h.preferences.weatherPhoto = false; h.weather.updateVisibility();
  assert.equal(h.requests[0].aborted, true); assert.equal(h.intervals.size, 0);
});
test('solar timestamps are UTC epochs, including explicit offsets, and old caches need no migration', () => {
  const h = harness({ settings: { weatherLocation: london } }); h.start();
  h.requests[0].respond({ ...conditions(), current: { temperature_2m: 12, weather_code: 0, is_day: 1 },
    daily: { sunrise: ['2026-10-24T06:00','2026-10-25T06:00+02:00'], sunset: ['2026-10-24T17:00','2026-10-25T17:00+02:00'] } });
  const reading = h.weather.currentReading();
  assert.equal(reading.solar[0].sunrise, Date.parse('2026-10-24T06:00Z'));
  assert.equal(reading.solar[1].sunset, Date.parse('2026-10-25T15:00Z'));
  const old = harness({ saved: cached() }); old.start();
  assert.equal(old.weather.currentReading().code, 3);
  old.advance(2*3600000+1); assert.equal(old.weather.currentReading(), null);
});

const ELEVEN_PM = Date.parse('2026-10-28T23:00:00Z');
const solarDays = (now = ELEVEN_PM) => {
  const midnight = Math.floor(now / 86400000) * 86400000;
  return [0, 1].map(offset => ({ sunrise: midnight + offset*86400000 + 6*3600000,
    sunset: midnight + offset*86400000 + 18*3600000 }));
};
const solarForecast = (code = 0, now = ELEVEN_PM) => ({
  current: { temperature_2m: 15, weather_code: code, is_day: 1 },
  daily: { sunrise: solarDays(now).map(day => new Date(day.sunrise).toISOString()),
    sunset: solarDays(now).map(day => new Date(day.sunset).toISOString()) }
});
const wallpaperRuntime = h => {
  const images = [], layer = {hidden: true, style: {}, className: ''};
  let restored = 0;
  const A = {settings: h.preferences, applyBackground() { restored++; }};
  h.context.document.getElementById = id => id === 'weather-photo' ? layer : h.el;
  h.context.document.body = {classList: {contains() {return false;}}};
  h.context.window.AeroTizen = A;
  h.context.Image = function () {images.push(this);};
  vm.runInContext(fs.readFileSync(path.join(root,'launcher/js/photo-weather.js'),'utf8'),h.context);
  return {images, layer, A, get restored() {return restored;}};
};

test('enabling wallpapers at 23:00 refreshes a fresh legacy cache immediately and never flashes daylight', () => {
  for (const day of [undefined, 1]) {
    const h = harness({ now: ELEVEN_PM, saved: cached({at: ELEVEN_PM-5*60000, code: 0, day}) });
    const photo = wallpaperRuntime(h);
    h.start(); assert.equal(h.requests.length, 0); assert.equal(h.el.nodes.b.textContent,'12°');
    h.preferences.weatherPhoto = true; h.weather.updateVisibility();
    assert.equal(h.requests.length, 1); assert.equal(h.intervals.size, 1);
    assert.equal(photo.images.length, 0); assert.equal(photo.layer.hidden, true);
    h.requests[0].respond(london); h.requests[1].respond(solarForecast());
    assert.equal(photo.images.length, 1); assert.match(photo.images[0].src,/night.jpg$/);
    photo.images[0].onload(); assert.match(photo.layer.className,/scene-night/);
    assert.equal(h.el.nodes.b.textContent,'15°');
  }
});

test('current solar cache does not refresh just because wallpapers are enabled, even with cached day=1 at night', () => {
  const h = harness({now: ELEVEN_PM, saved: cached({at:ELEVEN_PM-60000, day:1, solar:solarDays()})});
  h.start(); h.preferences.weatherPhoto=true;
  for(let i=0;i<4;i++)h.weather.updateVisibility();
  assert.equal(h.requests.length,0); assert.equal(h.intervals.size,1);
  assert.equal(h.weather.solarPhase(h.weather.currentReading(),ELEVEN_PM),'night');
});

test('missing, empty, malformed, wrong-day and expired solar caches request one repair at startup', () => {
  for(const solar of [undefined,null,[],{},[null],[{sunrise:NaN,sunset:ELEVEN_PM}],
    [{sunrise:null,sunset:ELEVEN_PM}],[{sunrise:'1',sunset:'2'}],
    [{sunrise:ELEVEN_PM,sunset:ELEVEN_PM}],
    solarDays(ELEVEN_PM-3*86400000),solarDays(ELEVEN_PM+3*86400000)]) {
    const h=harness({now:ELEVEN_PM,saved:cached({at:ELEVEN_PM,solar}),settings:{weatherPhoto:true}});
    h.start();h.weather.updateVisibility();h.weather.updateVisibility();
    assert.equal(h.requests.length,1);assert.equal(h.intervals.size,1);
  }
});

test('failed solar repair keeps widget cache and fallback, and toggles cannot cause a retry loop', () => {
  const saved=cached({at:ELEVEN_PM-60000,day:1});
  const h=harness({now:ELEVEN_PM,saved,settings:{weatherPhoto:true}});
  const photo=wallpaperRuntime(h);h.start();h.requests[0].ontimeout();
  for(let i=0;i<5;i++){
    h.preferences.weatherPhoto=false;h.weather.updateVisibility();
    h.preferences.weatherPhoto=true;h.weather.updateVisibility();
  }
  assert.equal(h.requests.length,1);assert.equal(h.intervals.size,1);
  assert.deepEqual(h.cached(),saved);assert.equal(h.el.nodes.b.textContent,'12°');
  assert.equal(photo.images.length,0);
  h.advance(20*60000);[...h.intervals.values()][0].fn();
  assert.equal(h.requests.length,2,'existing twenty-minute timer retries');
});

test('malformed fresh forecast solar data updates temperature but neither picks daylight nor retries on every render', () => {
  const h=harness({now:ELEVEN_PM,settings:{weatherLocation:london,weatherPhoto:true}});
  const photo=wallpaperRuntime(h);h.start();h.requests[0].respond(conditions(21));
  for(let i=0;i<5;i++)h.weather.updateVisibility();
  assert.equal(h.requests.length,1);assert.equal(h.el.nodes.b.textContent,'21°');
  assert.equal(h.weather.solarPhase(h.weather.currentReading(),ELEVEN_PM),'');
  assert.equal(photo.images.length,0);
});

test('a solar repair reuses the matching in-flight widget forecast', () => {
  const h=harness({now:ELEVEN_PM,settings:{weatherLocation:london}});h.start();
  h.preferences.weatherPhoto=true;h.weather.updateVisibility();h.weather.updateVisibility();
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].aborted,undefined);
  h.requests[0].respond(solarForecast());h.weather.updateVisibility();assert.equal(h.requests.length,1);
});

test('a location change cancels repair and a late old-city response cannot choose a wallpaper', () => {
  const h=harness({now:ELEVEN_PM,settings:{weatherLocation:london,weatherPhoto:true}});
  const photo=wallpaperRuntime(h);h.start();const old=h.requests[0];
  h.preferences.weatherLocation=boston;h.weather.refresh();
  assert.equal(old.aborted,true);old.respond(solarForecast(95));assert.equal(photo.images.length,0);
  h.requests[1].respond(solarForecast());assert.match(photo.images[0].src,/night.jpg$/);
  assert.equal(h.cached().source,JSON.stringify([boston.latitude,boston.longitude,boston.name,boston.country_code]));
});

test('turning both consumers off cancels repair; re-enable starts one usable request and one timer', () => {
  const h=harness({now:ELEVEN_PM,saved:cached({at:ELEVEN_PM}),settings:{showWeather:false,weatherPhoto:true}});
  h.start();const old=h.requests[0];h.preferences.weatherPhoto=false;h.weather.updateVisibility();
  assert.equal(old.aborted,true);assert.equal(h.intervals.size,0);
  h.preferences.weatherPhoto=true;h.weather.updateVisibility();h.weather.updateVisibility();
  assert.equal(h.requests.length,2);assert.equal(h.intervals.size,1);
  assert.equal(h.requests.filter(r=>!r.aborted).length,1);
});

test('offline solar cache stays usable until its weather expiry, then falls back without hiding the widget early', () => {
  const h=harness({now:ELEVEN_PM,saved:cached({at:ELEVEN_PM-30*60000,solar:solarDays(),day:1}),settings:{weatherPhoto:true}});
  const photo=wallpaperRuntime(h);h.start();photo.images[0].onload();h.requests[0].onerror();
  assert.match(photo.layer.className,/scene-night/);assert.equal(h.el.hidden,false);
  h.advance(2*3600000);h.weather.updateDisplay();
  assert.equal(photo.layer.hidden,true);assert.equal(h.el.hidden,true);
});

test('fresh solar forecasts select sunset, daytime weather and night rather than stale is_day', () => {
  for(const [time,code,scene] of [['12:00',61,'rain'],['17:30',0,'sunset'],['17:30',95,'storm'],['23:00',73,'night']]){
    const now=Date.parse('2026-10-28T'+time+':00Z');
    const h=harness({now,settings:{weatherPhoto:true,weatherLocation:london}});const photo=wallpaperRuntime(h);
    h.start();h.requests[0].respond(solarForecast(code,now));assert.match(photo.images[0].src,new RegExp('/'+scene+'\\.jpg$'));
  }
});

test('wallpapers disabled leave a fresh legacy widget cache usable without solar requests', () => {
  const h=harness({now:ELEVEN_PM,saved:cached({at:ELEVEN_PM-60000,day:1})});h.start();
  for(let i=0;i<4;i++)h.weather.updateVisibility();
  assert.equal(h.requests.length,0);assert.equal(h.el.nodes.b.textContent,'12°');assert.equal(h.intervals.size,1);
});

test('failed stale-cache repair is also throttled across wallpaper-only off/on toggles', () => {
  const h=harness({now:ELEVEN_PM,saved:cached({at:ELEVEN_PM-30*60000}),settings:{showWeather:false,weatherPhoto:true}});
  h.start();h.requests[0].onerror();
  for(let i=0;i<4;i++){
    h.preferences.weatherPhoto=false;h.weather.updateVisibility();
    h.preferences.weatherPhoto=true;h.weather.updateVisibility();
  }
  assert.equal(h.requests.length,1);assert.equal(h.intervals.size,1);
});

test('solar-day validation uses epochs across UTC midnight and does not depend on the TV timezone', () => {
  const h=harness();
  const sunrise=Date.parse('2026-10-27T22:00Z'),sunset=Date.parse('2026-10-28T10:00Z');
  for(const [time,phase] of [['2026-10-28T02:00Z','day'],['2026-10-28T09:30Z','sunset'],['2026-10-28T14:00Z','night']]){
    const now=Date.parse(time);
    assert.equal(h.weather.solarPhase({at:now,solar:[{sunrise,sunset},null]},now),phase);
  }
  const now=Date.parse('2026-10-29T02:00Z');
  assert.equal(h.weather.solarPhase({at:now,solar:[{sunrise,sunset}]},now),'');
});
