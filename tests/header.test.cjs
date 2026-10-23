const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function element() {
  const attributes = new Map(), classes = new Set();
  return {
    hidden: false, textContent: '', innerHTML: '',
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); },
    getAttribute(name) { return attributes.get(name); },
    classList: {
      toggle(name, enabled) { if (enabled) { classes.add(name); } else { classes.delete(name); } },
      contains(name) { return classes.has(name); }
    }
  };
}

function harness({ settings = {}, tizen, online = true } = {}) {
  const parent = element();
  const elements = Object.fromEntries(['date', 'time', 'network'].map(id => [id, { ...element(), parentNode: parent }]));
  const intervals = [];
  const A = {
    settings: { dateFormat: 'iso', timeFormat: '24', showTime: true, showNetwork: true, ...settings },
    tizen, $: id => elements[id]
  };
  const context = vm.createContext({
    window: { AeroTizen: A }, navigator: { onLine: online },
    Date: class extends Date { constructor() { super(2026, 9, 23, 14, 5); } },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; }
  });
  for (const file of ['clock.js', 'network.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'launcher/js', file), 'utf8'), context);
  }
  return { A, elements, intervals };
}

test('time and date visibility are independent in all four combinations', () => {
  for (const showTime of [true, false]) {
    for (const dateFormat of ['iso', 'none']) {
      const h = harness({ settings: { showTime, dateFormat } });
      h.A.clock.tick();
      assert.equal(h.elements.time.hidden, !showTime);
      assert.equal(h.elements.date.hidden, dateFormat === 'none');
      assert.equal(h.elements.time.textContent, '14:05');
      assert.equal(h.elements.date.textContent, dateFormat === 'none' ? '' : '2026-10-23');
    }
  }
});

test('clock applies changes immediately and keeps time hidden on later ticks', () => {
  const h = harness();
  h.A.clock.start();
  assert.equal(h.elements.time.hidden, false);
  h.A.settings.showTime = false;
  h.A.clock.tick();
  assert.equal(h.elements.time.hidden, true);
  h.intervals[0].fn();
  assert.equal(h.elements.time.hidden, true);
  assert.equal(h.elements.date.hidden, false);
  h.A.settings.showTime = true;
  h.A.settings.dateFormat = 'none';
  h.A.clock.tick();
  assert.equal(h.elements.time.hidden, false);
  assert.equal(h.elements.date.hidden, true);
});

test('network visibility applies on startup and changes immediately in the browser fallback', () => {
  const h = harness({ settings: { showNetwork: false }, online: false });
  h.A.network.start();
  assert.equal(h.elements.network.hasAttribute('hidden'), true);
  assert.equal(h.elements.network.getAttribute('aria-label'), 'Offline');
  h.intervals[0].fn();
  assert.equal(h.elements.network.hasAttribute('hidden'), true);
  h.A.settings.showNetwork = true;
  h.A.network.updateVisibility();
  assert.equal(h.elements.network.hasAttribute('hidden'), false);
  assert.equal(h.elements.network.getAttribute('aria-label'), 'Offline');
});

test('delayed network responses and change listeners cannot reveal a hidden indicator', () => {
  const requests = [], listeners = [];
  const tizen = { systeminfo: {
    getPropertyValue(property, success, failure) { requests.push({ property, success, failure }); },
    addPropertyValueChangeListener(property, listener) { listeners.push({ property, listener }); }
  } };
  const h = harness({ tizen });
  const indicator = h.elements.network;
  h.A.network.start();
  assert.equal(indicator.hasAttribute('hidden'), false);
  assert.equal(requests[0].property, 'NETWORK');
  h.A.settings.showNetwork = false;
  h.A.network.updateVisibility();
  requests[0].success({ networkType: 'WIFI' });
  assert.equal(requests[1].property, 'WIFI_NETWORK');
  requests[1].success({ signalStrength: 0.8 });
  assert.equal(indicator.hasAttribute('hidden'), true);
  assert.equal(indicator.getAttribute('aria-label'), 'Wi-Fi');

  assert.equal(listeners[0].property, 'NETWORK');
  listeners[0].listener();
  requests[2].success({ networkType: 'ETHERNET' });
  assert.equal(indicator.hasAttribute('hidden'), true);
  assert.equal(indicator.getAttribute('aria-label'), 'Ethernet');

  h.intervals[0].fn();
  requests[3].failure();
  assert.equal(indicator.hasAttribute('hidden'), true);
  h.A.settings.showNetwork = true;
  h.A.network.updateVisibility();
  assert.equal(indicator.hasAttribute('hidden'), false);
  assert.equal(indicator.getAttribute('aria-label'), 'Wi-Fi');
});
