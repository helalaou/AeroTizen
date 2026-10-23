// Launcher tests run the real browser scripts in a Node sandbox: node --test tests/*.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadSettings(storage) {
  const store = { ...storage };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  const A = {};
  const context = vm.createContext({ window: { AeroTizen: A, Intl, navigator: { language: 'en-GB', languages: ['en-GB'] } }, AeroTizen: A, localStorage });
  for (const file of ['config.js', 'settings.js', 'clock.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'launcher', 'js', file), 'utf8'), context);
  }
  A.settings.load();
  return { settings: A.settings, store };
}

test('defaults apply when nothing is saved', () => {
  const { settings } = loadSettings({});
  assert.equal(settings.background, 'aurora');
  assert.equal(settings.tempUnit, 'C');
  assert.equal(settings.timeFormat, '24');
  assert.equal(settings.home, null, 'null picks the default tiles on first launch');
});

test('an empty saved Home stays empty', () => {
  const { settings } = loadSettings({ 'aerotizen.settings.v1': JSON.stringify({ home: [] }) });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home)), []);
});

test('settings migrate from an earlier storage key and field name', () => {
  const legacy = { favorites: ['a.app', '__fire'], background: 'lava', speed: 2 };
  const { settings } = loadSettings({ 'hearth.home.v1': JSON.stringify(legacy) });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home)), ['a.app', '__fire']);
  assert.equal(settings.background, 'lava');
  assert.equal(settings.speed, 2);
});

test('save writes only known settings under the current key', () => {
  const { settings, store } = loadSettings({});
  settings.background = 'snow';
  settings.unrelated = 'ignored';
  settings.save();
  const saved = JSON.parse(store['aerotizen.settings.v1']);
  assert.equal(saved.background, 'snow');
  assert.equal('unrelated' in saved, false);
});

test('corrupt storage falls back to defaults', () => {
  const { settings } = loadSettings({ 'aerotizen.settings.v1': '{not json' });
  assert.equal(settings.background, 'aurora');
});
