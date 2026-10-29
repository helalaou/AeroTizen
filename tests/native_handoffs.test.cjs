'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const get = file => fs.readFileSync(path.join(__dirname, '../launcher/', file), 'utf8');
const nativeSource = get('js/native-navigation.js');
const inputSource = get('js/inputs.js');
const appsSource = get('js/apps.js');

function harness(options = {}) {
  const requests = [], launches = [], inputs = [], embedded = [], toasts = [], timers = [];
  const listeners = {}, watch = [], resume = [];
  function Request() {
    this.status = 0;
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.send = () => { requests.push(this); };
    this.resolve = status => { this.status = status; if (this.onload) this.onload(); };
    this.fail = () => { if (this.onerror) this.onerror(); };
  }
  const tz = {
    ApplicationControl: function (op) { this.operation = op; },
    application: {
      getAppMetaData() { return []; },
      launch(id, success, failure) {
        launches.push({ id, method: 'launch' });
        if (options.launchFails && (id === options.launchFails || options.launchFails === true)) {
          if (failure) failure({ name: 'Denied' });
        } else if (success) success();
      },
      launchAppControl(control, id, success, failure) {
        launches.push({ id, method: 'appcontrol' });
        if (options.appControlFails) { if (failure) failure({ name: 'Denied' }); }
        else if (success) success();
      }
    },
    systeminfo: { addPropertyValueChangeListener() {} },
    tvwindow: {
      setSource(source, success, failure, target) {
        inputs.push({ source, target });
        if (options.sourceFails) failure({ name: 'NoSource' });
        else success();
      },
      show(success) { embedded.push('shown'); if (success) success(); },
      hide() {}
    }
  };
  if (options.noNativeLaunch) { delete tz.application.launch; }
  if (options.noAppControl) {
    delete tz.ApplicationControl;
    delete tz.application.launchAppControl;
  }
  const document = {
    hidden: options.visible === true ? false : true,
    body: { classList: { add() {}, remove() {} } },
    documentElement: { style: {} }
  };
  const A = {
    tizen: tz,
    config: {
      SERVICE_URL: 'http://127.0.0.1:47790',
      STORE_PACKAGE: /^[A-Za-z0-9]{10}$/,
      HIDDEN_APPS: /service/i,
      HBBTV_APP_ID: 'org.tizen.hbbtv',
      HBBTV_LINK_METADATA: 'hbbtv.link',
      DEFAULT_HOME_APPS: [], FIREPLACE_ID: '__fire', STORE_APP_IDS: options.storeIds || []
    },
    homewatch: {
      watch(id) { watch.push(id); },
      resume() { resume.push(true); },
      useSamsungHome() {}
    },
    catalog: { preloadedStoreId() { return null; } },
    settings: { inputNames: {}, showLiveTv: true, hideDisconnectedHdmi: false },
    tiles: {
      shortName: name => name,
      ICONS: { tv: 'tv', hdmi: 'hdmi', box: 'box', pc: 'pc', game: 'game' }
    },
    toast: message => toasts.push(message),
    applyBackground() {}
  };
  const window = {
    AeroTizen: A,
    addEventListener(name, handler) { listeners[name] = handler; },
    setTimeout(fn, ms) { timers.push({ fn, ms }); },
    Backgrounds: { hide() {} }
  };
  const context = { window, document, XMLHttpRequest: Request };
  vm.runInNewContext(nativeSource, context, { filename: 'native-navigation.js' });
  vm.runInNewContext(inputSource, context, { filename: 'inputs.js' });
  vm.runInNewContext(appsSource, context, { filename: 'apps.js' });
  return { A, tz, requests, launches, inputs, embedded, watch, resume, toasts, timers, listeners,
    document };
}

test('YouTube/Cobalt waits for a confirmed /leave before starting', () => {
  const h = harness();
  h.A.apps.launch({ id: 'youtube.app', name: 'YouTube' });
  assert.equal(h.launches.length, 0);
  assert.deepEqual(h.requests.map(r => r.url), ['http://127.0.0.1:47790/leave']);
  h.requests[0].resolve(200);
  assert.deepEqual(h.launches.map(r => r.id), ['youtube.app']);
  assert.equal(h.watch.length, 0);
  assert.equal(h.resume.length, 0, 'watcher stays paused until return to AeroTizen');
});

test('YouTube rejects an unavailable /leave handoff without racing the watcher', () => {
  const h = harness();
  h.A.apps.launch({ id: 'youtube.app', name: 'YouTube' });
  h.requests[0].resolve(503);
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests[1].url, 'http://127.0.0.1:47790/home');
  assert.match(h.toasts[0], /HomeWatcher HTTP 503/);
});

test('double HTTP callbacks never launch YouTube more than once', () => {
  const h = harness();
  h.A.apps.launch({ id: 'youtube.app', name: 'YouTube' });
  h.requests[0].resolve(200);
  h.requests[0].resolve(200);
  assert.equal(h.launches.length, 1);
});

test('denied YouTube launch rearms HomeWatcher', () => {
  const h = harness({ launchFails: 'youtube.app' });
  h.A.apps.launch({ id: 'youtube.app', name: 'YouTube' });
  h.requests[0].resolve(200);
  assert.equal(h.requests[1].url, 'http://127.0.0.1:47790/home');
  assert.match(h.toasts[0], /Could not open YouTube/);
});

test('regular apps still use the original /watch launch sequence', () => {
  const h = harness();
  h.A.apps.launch({ id: 'netflix.app', name: 'Netflix' });
  assert.deepEqual(h.watch, ['netflix.app']);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.launches.map(r => r.id), ['netflix.app']);
});

test('Samsung Home requires the /leave acknowledgement', () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  h.A.homewatch.openSamsungHome();
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(200);
  assert.deepEqual(h.launches.map(r => r.id), ['com.samsung.tv.csfs']);
  assert.equal(h.requests.length, 1);
});

test('Samsung Home failed /leave does not launch and rearms the service', () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  h.requests[0].resolve(503);
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests[1].url, 'http://127.0.0.1:47790/home');
});

test('Samsung Home launch rejection uses native AppControl fallback', () => {
  const h = harness({ launchFails: 'com.samsung.tv.csfs' });
  h.A.homewatch.openSamsungHome();
  h.requests[0].resolve(200);
  assert.deepEqual(h.launches.map(r => r.method), ['launch', 'appcontrol']);
});

test('native Live TV uses the tested /leave before tuning and launching viewer', () => {
  const h = harness();
  const raw = { type: 'TV', number: 1 };
  h.A.inputs.show({ type: 'TV', number: 1, raw });
  assert.equal(h.launches.length, 0);
  assert.equal(h.inputs.length, 0);
  assert.equal(h.requests[0].url, 'http://127.0.0.1:47790/leave');
  h.requests[0].resolve(200);
  assert.equal(h.inputs.length, 1);
  assert.equal(h.inputs[0].source, raw);
  assert.equal(h.inputs[0].target, 'MAIN');
  assert.deepEqual(h.launches.map(r => r.id), ['org.tizen.tv-viewer']);
  assert.equal(h.embedded.length, 0);
});

test('native Live TV failed handoff never launches and rearms the service', () => {
  const h = harness();
  h.A.inputs.show({ type: 'TV', number: 1 });
  h.requests[0].fail();
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests[1].url, 'http://127.0.0.1:47790/home');
});

test('native Live TV launch failure reports error and rearms the service', () => {
  const h = harness({ launchFails: 'org.tizen.tv-viewer', noAppControl: true });
  h.A.inputs.show({ type: 'TV', number: 1 });
  h.requests[0].resolve(200);
  assert.equal(h.requests[1].url, 'http://127.0.0.1:47790/home');
  assert.match(h.toasts[0], /Could not open Live TV/);
});

test('old firmware without the viewer launch API uses upstream TVWindow', () => {
  const h = harness({ noNativeLaunch: true });
  h.A.inputs.show({ type: 'TV', number: 1 });
  assert.equal(h.requests.length, 0);
  assert.equal(h.embedded.length, 1);
});

test('HDMI always uses TVWindow and never touches native Home or watcher', () => {
  const h = harness();
  h.A.inputs.show({ type: 'HDMI', number: 2 });
  assert.equal(h.embedded.length, 1);
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests.length, 0);
});

test('native Live TV fallback rearms when launch accepted but never takes focus', () => {
  const h = harness({ visible: true });
  h.A.inputs.show({ type: 'TV', number: 1 });
  h.requests[0].resolve(200);
  assert.equal(h.timers[0].ms, 2100);
  h.timers[0].fn();
  assert.equal(h.requests[1].url, 'http://127.0.0.1:47790/home');
});

test('on page reload native handoff re-arms HomeWatcher', () => {
  const h = harness();
  assert.equal(typeof h.listeners.load, 'function');
  h.listeners.load();
  assert.equal(h.requests[0].url, 'http://127.0.0.1:47790/home');
});

test('port does not replace the upstream Frame-aware watcher service', () => {
  const html = get('index.html');
  assert.ok(html.indexOf('src="js/homewatch.js"') >= 0);
  assert.ok(html.indexOf('src="js/native-navigation.js"') > html.indexOf('src="js/homewatch.js"'));
  assert.ok(html.indexOf('src="js/apps.js"') > html.indexOf('src="js/native-navigation.js"'));
  const service = get('service/index.js');
  assert.match(service, /FRAME_HIDDEN_GRACE/);
  assert.match(service, /createArtMode/);
  assert.doesNotMatch(nativeSource, /app_operation_set_current_app|vconf_set_str/);
});

test('app store opens com.samsung.tv.store before the org.volt.apps alias', () => {
  const config = { window: { AeroTizen: {} } };
  config.AeroTizen = config.window.AeroTizen;
  vm.runInNewContext(get('js/config.js'), config, { filename: 'config.js' });
  const storeIds = Array.from(config.AeroTizen.config.STORE_APP_IDS);
  assert.deepEqual(storeIds, ['com.samsung.tv.store', 'org.volt.apps']);

  const h = harness({ storeIds });
  h.A.apps.openStore();
  assert.deepEqual(h.launches.map(r => r.id), ['com.samsung.tv.store'],
    'a successful launch does not also open the alias');
});

test('app store falls back to org.volt.apps where com.samsung.tv.store is missing', () => {
  const h = harness({ storeIds: ['com.samsung.tv.store', 'org.volt.apps'], launchFails: 'com.samsung.tv.store' });
  h.A.apps.openStore();
  assert.deepEqual(h.launches.map(r => r.id), ['com.samsung.tv.store', 'org.volt.apps']);
  assert.deepEqual(h.toasts, []);
});
