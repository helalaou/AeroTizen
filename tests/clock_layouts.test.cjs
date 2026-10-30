// Regression tests for the imported custom-clock structure and cached weather.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function runtime(saved = {}, cache) {
  const values = new Map([['aerotizen.settings.v1', JSON.stringify(saved)]]);
  if (cache) { values.set('aerotizen.weather.v2', JSON.stringify(cache)); }
  function element() {
    const classes = new Set();
    const node = {
      hidden: false, style: {}, childNodes: [], parentNode: { classList: { toggle() {} } },
      classList: {
        add: key => classes.add(key),
        remove: (...keys) => keys.forEach(key => classes.delete(key)),
        contains: key => classes.has(key),
        toggle: (key, on) => {
          if (on) { classes.add(key); } else { classes.delete(key); }
        }
      },
      querySelector: () => null,
      setAttribute() {},
      appendChild(child) { this.childNodes.push(child); return child; },
      cloneNode() { return element(); }
    };
    let value = '';
    Object.defineProperty(node, 'textContent', {
      get: () => value,
      set: next => { value = String(next); node.childNodes = []; }
    });
    return node;
  }
  const elements = {};
  [
    'date', 'time', 'weather', 'aero-v991-widget', 'aero-v991-hours',
    'aero-v991-minutes', 'aero-v991-date', 'aero-v991-weather-icon',
    'aero-v991-temp', 'aero-v991-condition', 'aero-v991-city'
  ].forEach(id => { elements[id] = element(); });
  elements['aero-v991-weather-icon'].parentNode = element();
  const document = {
    body: element(),
    getElementById: id => elements[id],
    createElement: () => element(),
    addEventListener() {}
  };
  const A = { $: id => elements[id] };
  const context = vm.createContext({
    window: { AeroTizen: A, navigator: { languages: ['en-GB'], language: 'en-GB' }, Intl },
    document, AeroTizen: A, Date, isFinite,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }
    }
  });
  for (const name of ['config.js', 'settings.js', 'clock.js', 'clock-layouts.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../launcher/js', name), 'utf8'), context);
  }
  A.settings.load();
  return { A, elements, values, document };
}

test('existing installations default to the original compact header', () => {
  for (const saved of [{}, { showTime: false, dateFormat: 'none' }]) {
    const { A, elements, document } = runtime(saved);
    A.clockLayouts.apply();
    assert.equal(A.settings.clockLayout, 'classic');
    assert.equal(elements['aero-v991-widget'].hidden, true);
    assert.equal(document.body.classList.contains('s90c-clock-classic'), true);
  }
});

test('four imported clock styles can be selected and persisted', () => {
  const { A, elements, values } = runtime({ clockLayout: 'custom', timeFormat: '24' });
  A.clockLayouts.apply();
  assert.equal(elements['aero-v991-widget'].hidden, false);
  for (const style of ['vertical', 'horizontal', 'minimal', 'bold']) {
    A.clockLayouts.chooseStyle(style);
    assert.equal(A.settings.aeroClockStyle, style);
    assert.equal(JSON.parse(values.get(A.config.STORAGE_KEY)).aeroClockStyle, style);
    assert.equal(elements['aero-v991-widget'].classList.contains('style-' + style), style !== 'vertical');
  }
  A.clockLayouts.chooseLayout('classic');
  assert.equal(elements['aero-v991-widget'].hidden, true);
});

test('large clock uses upstream date and 24-hour time formats', () => {
  const { A, elements } = runtime({ clockLayout: 'custom', timeFormat: '24', dateFormat: 'iso' });
  A.clockLayouts.apply();
  assert.match(elements['aero-v991-hours'].textContent, /^\d{2}$/);
  assert.match(elements['aero-v991-minutes'].textContent, /^\d{2}$/);
  assert.match(elements['aero-v991-date'].textContent, /^\d{4}-\d{2}-\d{2}$/);
});

test('the tested cache validation rejects stale and mismatched weather', () => {
  const saved = { clockLayout: 'custom', showWeather: true, tempUnit: 'C' };
  const old = runtime(saved, { source: 'auto', temp: 20, code: 0, at: Date.now() - 8000000, unit: 'C' });
  old.A.clockLayouts.apply();
  assert.equal(old.elements['aero-v991-temp'].textContent, '--°');
  const wrongUnit = runtime(saved, { source: 'auto', temp: 20, code: 0, at: Date.now(), unit: 'F' });
  wrongUnit.A.clockLayouts.apply();
  assert.equal(wrongUnit.elements['aero-v991-temp'].textContent, '--°');
});

test('valid cached weather renders temperature, WMO condition and city', () => {
  const { A, elements } = runtime(
    { clockLayout: 'custom', tempUnit: 'C', weatherShowLocation: true },
    { source: 'auto', temp: 23.4, code: 3, at: Date.now(), unit: 'C', city: 'Cagliari' }
  );
  A.clockLayouts.apply();
  assert.equal(elements['aero-v991-temp'].textContent, '23°');
  assert.equal(elements['aero-v991-condition'].textContent, 'Cloudy');
  assert.equal(elements['aero-v991-city'].textContent, 'Cagliari');
  A.settings.weatherShowLocation = false;
  A.clockLayouts.refreshWeather();
  assert.equal(elements['aero-v991-city'].textContent, '');
});

test('time, weather, and date visibility respect saved preferences', () => {
  const { A, elements } = runtime({ clockLayout: 'custom', showTime: false, showWeather: false, dateFormat: 'none' });
  A.clockLayouts.apply();
  assert.equal(elements['aero-v991-widget'].hidden, true);
  assert.equal(elements['aero-v991-hours'].style.display, 'none');
  assert.equal(elements['aero-v991-weather-icon'].parentNode.style.display, 'none');
  assert.equal(elements['aero-v991-date'].style.display, 'none');
});
