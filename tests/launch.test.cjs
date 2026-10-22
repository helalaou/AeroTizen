const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const launcher = path.join(__dirname, '..', 'launcher');
const metadataKey = 'http://samsung.com/tv/metadata/hbbtv.link';
const host = 'org.tizen.hbbtv';
const plain = value => JSON.parse(JSON.stringify(value));

function appHarness(metadata, options = {}) {
  const calls = { launch: [], control: [], watch: [], toast: [], metadata: [] };
  const application = {
    getAppMetaData(id) {
      calls.metadata.push(id);
      if (metadata instanceof Error) throw metadata;
      return typeof metadata === 'function' ? metadata(id) : metadata;
    },
    getAppsInfo(done) { done(options.installed || []); },
    launch(id, success, fail) { calls.launch.push({ id, fail }); },
    launchAppControl(control, id, success, fail) {
      if (options.throwLaunch) throw new Error('launch denied');
      calls.control.push({ control: plain(control), id, fail });
    }
  };
  if (options.noMetadata) delete application.getAppMetaData;
  const A = {
    tizen: options.preview ? null : {
      application,
      ApplicationControlData: function (key, value) { this.key = key; this.value = value; },
      ApplicationControl: function (operation, uri, mime, category, data) {
        Object.assign(this, { operation, uri, mime, category, data });
      }
    },
    tiles: { shortName: name => name },
    homewatch: { watch: id => calls.watch.push(id) },
    toast: message => calls.toast.push(message)
  };
  const context = vm.createContext({ window: { AeroTizen: A }, AeroTizen: A });
  for (const file of ['config.js', 'apps.js']) {
    vm.runInContext(fs.readFileSync(path.join(launcher, 'js', file), 'utf8'), context);
  }
  return { A, calls };
}

test('HbbTV metadata routes arbitrary apps through the shared host', () => {
  const links = {
    'wrapper.one': 'https://example.invalid/first_@FHD',
    'wrapper.two': 'https://example.invalid/second?content=123'
  };
  const { A, calls } = appHarness(id => [{ key: metadataKey, value: links[id] }]);
  for (const id of Object.keys(links)) A.apps.launch({ id, name: id });
  assert.deepEqual(calls.metadata, Object.keys(links));
  assert.deepEqual(calls.watch, [host, host]);
  assert.equal(calls.launch.length, 0);
  for (const [index, id] of Object.keys(links).entries()) {
    assert.equal(calls.control[index].id, host);
    assert.deepEqual(calls.control[index].control, {
      operation: 'http://tizen.org/appcontrol/operation/default',
      uri: null, mime: null, category: null,
      data: [
        { key: 'tizenid', value: [id] },
        { key: 'hbbtv', value: [links[id]] },
        { key: 'deeplink', value: ['true'] }
      ]
    });
  }
});

test('missing or unavailable HbbTV metadata retains normal app launch', () => {
  const cases = [
    [], undefined, null, [null],
    [{ key: metadataKey, value: '' }],
    [{ key: metadataKey, value: '  ' }],
    [{ key: metadataKey, value: 42 }],
    [{ key: 'unrelated.link', value: 'https://example.invalid' }],
    new Error('metadata access denied')
  ];
  for (const metadata of cases) {
    const { A, calls } = appHarness(metadata);
    A.apps.launch({ id: 'normal.app', name: 'Normal' });
    assert.equal(calls.launch[0].id, 'normal.app');
    assert.deepEqual(calls.watch, ['normal.app']);
    assert.equal(calls.control.length, 0);
    calls.launch[0].fail();
    assert.deepEqual(calls.toast, ['Could not open Normal']);
  }
  const { A, calls } = appHarness(null, { noMetadata: true });
  A.apps.launch({ id: 'older.app', name: 'Older' });
  assert.equal(calls.launch[0].id, 'older.app');
});

test('HbbTV failures are reported without a second launch attempt', () => {
  for (const throwLaunch of [false, true]) {
    const { A, calls } = appHarness([{ key: metadataKey, value: 'https://example.invalid' }], { throwLaunch });
    A.apps.launch({ id: 'wrapper.app', name: 'Hybrid' });
    if (!throwLaunch) calls.control[0].fail();
    assert.deepEqual(calls.toast, ['Could not open Hybrid']);
    assert.equal(calls.launch.length, 0);
  }
});

test('watcher inventory includes an installed HbbTV host without adding a host tile', () => {
  const installed = [
    { id: host, packageId: 'ug-hbbtv-efl', name: 'hbbtv', show: false },
    { id: 'normal.app', packageId: 'abcdefghij', name: 'Normal', show: true },
    { id: 'org.tizen.netflix-app', packageId: 'org.tizen.netflix-app', name: 'Netflix', show: true }
  ];
  const { A } = appHarness([], { installed });
  let loaded = false;
  A.apps.load(() => { loaded = true; });
  assert.equal(loaded, true);
  assert.deepEqual(plain(A.apps.realIds), [host, 'normal.app', '3201907018807']);
  assert.deepEqual(plain(A.apps.all).map(app => app.id), ['org.tizen.netflix-app', 'normal.app']);
  const absent = appHarness([], { installed: [installed[1]] });
  absent.A.apps.load(() => {});
  assert.deepEqual(plain(absent.A.apps.realIds), ['normal.app']);
});

test('desktop preview launches without consulting TV metadata', () => {
  const { A, calls } = appHarness(null, { preview: true });
  A.apps.launch({ id: 'demo1', name: 'Demo' });
  assert.deepEqual(calls.toast, ['Would open Demo']);
  assert.deepEqual(calls.metadata, []);
});

function watcherHarness() {
  const self = 'DclHome001.Home';
  const statuses = { [self]: { running: true, visible: false }, [host]: { running: true, visible: true } };
  const launches = [];
  let now = 10000, tick, handler;
  const http = {
    get(options, callback) {
      const request = new EventEmitter();
      request.destroy = () => {};
      const response = new EventEmitter();
      callback(response);
      queueMicrotask(() => {
        // The device-info endpoint tells the watcher this is not a Frame TV.
        const body = options.path === '/api/v2/'
          ? { device: { modelName: 'TEST', FrameTVSupport: 'false', PowerState: 'on' } }
          : statuses[decodeURIComponent(options.path.split('/').pop())] || {};
        response.statusCode = 200;
        response.emit('data', JSON.stringify(body));
        response.emit('end');
      });
      return request;
    },
    createServer(callback) { handler = callback; return { listen() {} }; }
  };
  const context = vm.createContext({
    // Art Mode is never queried on a non-Frame TV, so its client is a stub here.
    require: name => name === 'http' ? http
      : name === './artmode' ? () => ({ start() {}, stop() {}, fresh() {}, getState: () => ({}) })
      : require(name),
    module: { exports: {} },
    tizen: { application: { launch: id => launches.push(id) } },
    Date: { now: () => now },
    setInterval: fn => { tick = fn; },
    setTimeout() {},
    clearTimeout() {}
  });
  vm.runInContext(fs.readFileSync(path.join(launcher, 'service', 'index.js'), 'utf8'), context);
  context.module.exports.onStart();
  now += 3000; // past the boot delay
  function request(url) {
    let state;
    handler({ url }, { writeHead() {}, end(body) { state = JSON.parse(body); } });
    return state;
  }
  return {
    self, statuses, launches, request,
    advance: ms => { now += ms; },
    async tick() {
      // Let pending replies (including the device-info one at start) land first.
      await new Promise(resolve => setImmediate(resolve));
      tick();
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}

test('watcher follows host visibility rather than the wrapper identity', async () => {
  const watcher = watcherHarness();
  watcher.request('/watch?id=' + host);
  await watcher.tick();
  assert.equal(watcher.request('/').seen, true);
  watcher.statuses[host].visible = false;
  await watcher.tick();
  assert.deepEqual(watcher.launches, [watcher.self]);
});

test('watcher stands aside for a visible externally launched HbbTV host', async () => {
  const watcher = watcherHarness();
  watcher.request('/apps?ids=' + host);
  await watcher.tick();
  watcher.advance(3000);
  await watcher.tick();
  assert.equal(watcher.request('/').watched, host);
  assert.deepEqual(watcher.launches, []);
});

test('unavailable host status does not falsely reclaim a watched HbbTV app', async () => {
  const watcher = watcherHarness();
  delete watcher.statuses[host];
  watcher.request('/watch?id=' + host);
  await watcher.tick();
  watcher.advance(5000);
  await watcher.tick();
  assert.equal(watcher.request('/').seen, false);
  assert.deepEqual(watcher.launches, []);
});
