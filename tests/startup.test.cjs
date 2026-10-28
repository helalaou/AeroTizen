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
  continueWatching: { start() {} },
  clock: { start() {}, tick() {} }, network: { start() {} },
  inputs: { load() {} }, settingsUi: { isOpen: () => false },
  homewatch: { start() {}, reportApps() {}, reportStartup() {} },
  homeScreen: { render() { calls.push('render'); }, refreshApps() { calls.push('refresh'); } }
  };
  const localStorage = { getItem: key => data[key] || null, setItem: (key, value) => { data[key] = value; } };
  const window = { AeroTizen: A, tizen: A.tizen, Backgrounds: { setSpeed() {}, apply() {} },
    Weather: { start() {} }, addEventListener: (name, fn) => { events[name] = fn; }, performance: { timing: { navigationStart: Date.now() - 10 } },
    requestAnimationFrame: cb => frames.push(cb) };
  const document = { hidden: false, addEventListener() {} };
  const context = vm.createContext({ window, AeroTizen: A, document, localStorage, setTimeout: cb => timers.push(cb) });
  for (const file of ['config.js', 'startup.js', 'apps.js']) vm.runInContext(source(file), context);
  return { A, calls, timers, frames, data, events, document, window, context, reply: list => reply(list), fail: () => reject(),
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

test('startup records routing flags and focus without keeping private launch payloads', () => {
  const h = harness();
  let focused = false;
  let control = { operation: 'http://tizen.org/appcontrol/operation/main', data: [
    { key: 'entry_point', value: ['cold_booting'] },
    { key: '__K_BG_LAUNCH', value: ['enable'] },
    { key: 'PAYLOAD', value: ['private title and token'] }
  ] };
  h.document.hasFocus = () => focused;
  h.A.tizen.application.getCurrentApplication = () => ({ getRequestedAppControl: () => ({ appControl: control }) });
  h.boot(); h.discover();
  let trace = JSON.parse(h.data['aerotizen.startup.v1']);
  assert.deepEqual(trace.launch.data, { entry_point: 'cold_booting', __K_BG_LAUNCH: 'enable' });
  assert.equal(trace.marks.at(-1).focused, false);
  assert.equal(JSON.stringify(trace).includes('private title'), false);
  focused = true; h.events.focus();
  control = { operation: 'main', data: [{ key: 'entry_point', value: ['smarthub_key'] }] };
  h.events.appcontrol();
  trace = JSON.parse(h.data['aerotizen.startup.v1']);
  assert.equal(trace.launch.data.entry_point, 'cold_booting');
  assert.equal(trace.last_launch.data.entry_point, 'smarthub_key');
  assert.equal(trace.marks.at(-1).name, 'appcontrol');
  assert.equal(trace.marks.at(-1).focused, true);
});

test('diagnostics stay bounded and tolerate unavailable launch APIs', () => {
  const h = harness(); h.document.hasFocus = () => false;
  h.A.tizen.application.getCurrentApplication = () => { throw Object.assign(new Error('private data'), { name: 'SecurityError' }); };
  h.boot(); h.discover();
  for (let i = 0; i < 100; i++) { h.events.appcontrol(); h.events.blur(); }
  let trace = JSON.parse(h.data['aerotizen.startup.v1']);
  assert.equal(trace.marks.length, 32);
  assert.equal(trace.launch.error, 'SecurityError');
  assert.equal(JSON.stringify(trace).includes('private data'), false);
  h.A.tizen.application.getCurrentApplication = () => ({ getRequestedAppControl: () => ({ appControl: {
    operation: 'x'.repeat(1000), data: ['entry_point', '__K_BG_LAUNCH', 'init', 'SkipReload'].map(key => ({ key, value: ['x'.repeat(1000)] }))
  } }) });
  h.events.appcontrol();
  trace = JSON.parse(h.data['aerotizen.startup.v1']);
  assert.equal(trace.last_launch.operation.length, 96);
  assert.equal(trace.last_launch.data.entry_point.length, 48);
  assert.ok(JSON.stringify(trace).length <= 4096);
});
