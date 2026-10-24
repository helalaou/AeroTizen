const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function runtime(saved = {}, locale = 'en-GB') {
  const values = new Map([['aerotizen.settings.v1', JSON.stringify(saved)]]);
  const css = new Set();
  function element() {
    const node = {
      hidden: false, childNodes: [], parentNode: { classList: { toggle() {} } },
      setAttribute() {}, classList: { toggle(name, on) {
        if (on) { css.add(name); } else { css.delete(name); }
      } }, appendChild(child) { this.childNodes.push(child); return child; },
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
    'date', 'time', 'weather', 'clock-custom-widget', 'clock-custom-digits',
    'clock-custom-hours', 'clock-custom-minutes', 'clock-custom-period',
    'clock-custom-date', 'clock-custom-weather'
  ].forEach(id => { elements[id] = element(); });
  elements.time.setAttribute = function (name, value) { this[name] = value; };
  const A = { $: id => elements[id] };
  const doc = {
    body: { classList: { toggle(name, on) {
      if (on) { css.add(name); } else { css.delete(name); }
    } } },
    getElementById: id => elements[id]
  };
  const context = vm.createContext({
    window: { AeroTizen: A, navigator: { languages: [locale], language: locale }, Intl },
    document: doc, AeroTizen: A,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }
    }
  });
  for (const name of ['config.js', 'settings.js', 'clock.js', 'clock-layouts.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../launcher/js', name), 'utf8'), context);
  }
  A.settings.load();
  return { A, elements, css, values };
}

test('original compact header remains the default, including old saved preferences', () => {
  for (const saved of [{}, { showTime: false, dateFormat: 'none' }]) {
    const { A, elements, css } = runtime(saved);
    A.clockLayouts.apply();
    assert.equal(A.settings.clockLayout, 'classic');
    assert.equal(elements['clock-custom-widget'].hidden, true);
    assert.equal(css.has('clock-custom'), false);
  }
});

test('all four V992.56 clock styles share the upstream locale and persist', () => {
  const { A, elements, css, values } = runtime({ clockLayout: 'custom', timeFormat: '12' }, 'en-US');
  A.clockLayouts.apply();
  assert.equal(css.has('clock-custom'), true);
  assert.equal(elements['clock-custom-widget'].hidden, false);
  assert.ok(elements['clock-custom-hours'].textContent);
  assert.ok(elements['clock-custom-date'].textContent);
  for (const style of ['vertical', 'horizontal', 'minimal', 'bold']) {
    A.clockLayouts.chooseStyle(style);
    assert.equal(A.settings.aeroClockStyle, style);
    assert.equal(elements['clock-custom-widget'].className, 'clock-custom-widget style-' + style);
    assert.equal(JSON.parse(values.get(A.config.STORAGE_KEY)).aeroClockStyle, style);
  }
  A.clockLayouts.chooseLayout('classic');
  assert.equal(elements['clock-custom-widget'].hidden, true);
  assert.equal(css.has('clock-custom'), false);
  assert.equal(JSON.parse(values.get(A.config.STORAGE_KEY)).clockLayout, 'classic');
});

test('time/date visibility and upstream formats apply to the custom clock', () => {
  const { A, elements } = runtime({ clockLayout: 'custom', timeFormat: '24', dateFormat: 'iso' });
  A.clockLayouts.apply();
  assert.match(elements['clock-custom-hours'].textContent, /^\\d{2}$/);
  assert.match(elements['clock-custom-date'].textContent, /^\\d{4}-\\d{2}-\\d{2}$/);
  A.settings.showTime = false;
  A.settings.dateFormat = 'none';
  A.clock.tick();
  assert.equal(elements['clock-custom-digits'].hidden, true);
  assert.equal(elements['clock-custom-date'].hidden, true);
  assert.equal(elements['clock-custom-widget'].hidden, true);
});

test('custom weather mirrors upstream readings and honors visibility', () => {
  const { A, elements } = runtime({ clockLayout: 'custom' });
  const upstream = elements.weather;
  upstream.hidden = false;
  const sample = { cloneNode: () => ({ sample: true }) };
  upstream.childNodes.push(sample);
  A.clockLayouts.apply();
  assert.equal(elements['clock-custom-weather'].hidden, false);
  assert.equal(elements['clock-custom-weather'].childNodes.length, 1);
  upstream.hidden = true;
  A.clockLayouts.update();
  assert.equal(elements['clock-custom-weather'].hidden, true);
  assert.equal(elements['clock-custom-weather'].childNodes.length, 0);
});

test('unknown saved clock choices fall back without changing stored data', () => {
  const { A, elements } = runtime({ clockLayout: 'invalid', aeroClockStyle: 'invalid' });
  A.clockLayouts.apply();
  assert.equal(elements['clock-custom-widget'].hidden, true);
  assert.equal(elements['clock-custom-widget'].className, 'clock-custom-widget style-vertical');
  assert.equal(A.settings.clockLayout, 'invalid');
});
