const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../launcher/js/network.js'), 'utf8');
function setup(level, standard, online = true) {
  const attrs = {}, requests = [], timers = [];
  const el = { setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, classList: { toggle() {} } };
  const A = { settings: {}, $: () => el, tizen: { systeminfo: {
    getPropertyValue(key, yes, no) { requests.push({ key, yes, no }); }, addPropertyValueChangeListener() {}
  } } };
  vm.runInNewContext(source, { window: { AeroTizen: A, webapis: { network: {
    getWiFiSignalStrengthLevel() { if (level instanceof Error) throw level; return level; }
  } } }, navigator: { onLine: online }, setInterval: fn => timers.push(fn) });
  A.network.start();
  return { A, attrs, requests, timers, wifi() {
    requests[0].yes({ networkType: 'WIFI' });
    if (requests[1]) requests[1].yes({ signalStrength: standard });
  } };
}
test('Samsung levels 1..5 use discrete bars; unsupported levels keep standard Tizen fallback', () => {
  for (const [level, expected] of [[1, 0.2], [2, 0.5], [3, 0.5], [4, 1], [5, 1]]) {
    const h = setup(level); h.wifi();
    assert.equal(h.attrs['data-net-level'], String(expected));
    assert.equal(h.requests.length, 1);
  }
  for (const level of [undefined, null, 0, 6, 1.5, '5', new Error('denied')]) {
    const h = setup(level, 0.4); h.wifi();
    assert.equal(h.attrs['data-net-level'], '0.4');
  }
});
test('invalid strength is unavailable, never represented as measured weak Wi-Fi', () => {
  for (const signal of [undefined, null, -1, 2, NaN, '0.2']) {
    const h = setup(undefined, signal); h.wifi();
    assert.equal(h.attrs['data-net-level'], 'unknown');
    assert.equal(h.attrs['aria-label'], 'Wi-Fi (signal unavailable)');
  }
});
test('unknown and failed network reports never invent Wi-Fi or offline', () => {
  const h = setup(); h.requests[0].no();
  assert.equal(h.attrs['data-net-kind'], 'unknown');
  const off = setup(undefined, undefined, false); off.requests[0].no();
  assert.equal(off.attrs['data-net-kind'], 'offline');
});
test('late Wi-Fi callbacks cannot overwrite a newer Ethernet report; start is idempotent', () => {
  const h = setup(); h.requests[0].yes({ networkType: 'WIFI' });
  h.A.network.refresh(); h.requests[2].yes({ networkType: 'ETHERNET' });
  h.requests[1].yes({ signalStrength: 0.1 });
  assert.equal(h.attrs['data-net-kind'], 'ethernet');
  h.A.network.start(); assert.equal(h.timers.length, 1);
});
