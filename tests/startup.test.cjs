const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = file => fs.readFileSync(__dirname + '/../launcher/js/' + file, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(mode = 'deferred', saved = ['youtube.id']) {
  const timers = [], frames = [], calls = [], data = {}, events = {};
  let reply, reject;
  const A = { tizen: { application: { getAppsInfo(done, fail) {
    calls.push('discover'); reply = done; reject = fail;
    if (mode === 'throw') throw new Error('not ready');
    if (mode === 'fail') fail();
  } } }, catalog: { preloadedStoreId: () => null },
  settings: { home: saved, load() {}, save() { calls.push('save'); } },
  clock: { start() {}, tick() {} }, network: { start() {} },
  inputs: { load() {} }, settingsUi: { isOpen: () => false },
  homewatch: { start() {}, reportApps() {}, reportStartup() {} },
  homeScreen: { render() { calls.push('render'); }, refreshApps() { calls.push('refresh'); } }
  };
  const localStorage = { getItem: key => data[key] || null, setItem: (key, value) => { data[key] = value; } };
  const window = { AeroTizen: A, Backgrounds: { setSpeed() {}, apply() {} },
    Weather: { start() {} }, addEventListener: (name, fn) => { events[name] = fn; }, performance: { timing: { navigationStart: Date.now() - 10 } },
    requestAnimationFrame: cb => frames.push(cb) };
  const document = { hidden: false, addEventListener() {} };
  const context = vm.createContext({ window, AeroTizen: A, document, localStorage, setTimeout: cb => timers.push(cb) });
  for (const file of ['config.js', 'startup.js', 'apps.js']) vm.runInContext(source(file), context);
  return { A, calls, timers, frames, data, context, reply: list => reply(list), fail: () => reject(),
    discover() { events.load(); frames.shift()(); frames.shift()(); timers.shift()(); },
    boot() { vm.runInContext(source('main.js'), context); } };
}

for (const mode of ['deferred', 'throw', 'fail']) test('Home renders before ' + mode + ' package discovery and keeps favourites', () => {
  const h = harness(mode); h.boot();
  assert.deepEqual(h.calls, ['render']);
  h.discover();
  assert.equal(h.calls[0], 'render');
  assert.equal(h.calls[1], 'discover');
  assert.deepEqual(h.A.settings.home, ['youtube.id']);
  assert.equal(h.A.apps.byId('youtube.id').id, 'youtube.id');
  assert.equal(h.A.apps.ready, false);
});

test('late discovery refreshes once and caches labels without resetting saved Home', () => {
  const h = harness(); h.boot(); h.discover();
  const list = [{ id: 'youtube.id', name: 'YouTube', show: true, packageId: 'abcdefghij', iconPath: 'icon.png' }];
  h.reply(list); h.reply(list); h.fail();
  assert.equal(h.calls.filter(x => x === 'refresh').length, 1);
  assert.deepEqual(h.A.settings.home, ['youtube.id']);
  assert.equal(h.A.apps.ready, true);
  const cached = JSON.parse(h.data['aerotizen.apps.v1']);
  assert.equal(cached[0].name, 'YouTube');
});

test('missing cache and never-returning discovery do not save first-run defaults early', () => {
  const h = harness('deferred', null); h.boot(); h.discover();
  assert.equal(h.A.settings.home, null);
  assert.equal(h.calls.includes('save'), false);
});

test('valid cached labels remain available if discovery fails; malformed cache is ignored', () => {
  const h = harness('fail');
  h.data['aerotizen.apps.v1'] = JSON.stringify([{ id: 'youtube.id', name: 'YouTube', icon: '' }, null]);
  h.boot(); h.discover();
  assert.equal(h.A.apps.byId('youtube.id').name, 'YouTube');
  assert.deepEqual(plain(h.A.settings.home), ['youtube.id']);
  const bad = harness(); bad.data['aerotizen.apps.v1'] = '{';
  bad.boot(); assert.equal(bad.A.apps.byId('youtube.id').name, 'youtube.id');
});
