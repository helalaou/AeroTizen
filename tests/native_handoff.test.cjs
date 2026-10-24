'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../launcher/js', name), 'utf8');

function harness() {
  const http = [], apps = [], controls = [], sources = [], toasts = [], timers = [];
  const events = {};
  const doc = { hidden: false, addEventListener: (n, fn) => { events[n] = fn; } };
  const application = {
    launch(id, ok, fail) { apps.push({ id, ok, fail }); },
    launchAppControl(ctrl, id, ok, fail) { controls.push({ id, ctrl, ok, fail }); },
    getAppMetaData() { return []; },
    getCurrentApplication() { return { exit() { throw Error('must not exit'); } }; }
  };
  const window = {
    AeroTizen: null,
    addEventListener(n, cb) { events['window:' + n] = cb; },
    setTimeout(fn, ms) { timers.push({ fn, ms }); }
  };
  function XHR() {
    this.open = (_, url) => { this.url = url; };
    this.send = () => { http.push(this); };
    this.respond = status => {
      this.status = status;
      if (this.onload) this.onload();
    };
  }
  const tvwindow = {
    setSource(s, ok, fail, target) { sources.push({ s, ok, fail, target }); },
    show() {}
  };
  const A = {
    config: {
      SERVICE_URL: 'http://127.0.0.1:47790',
      SERVICE_ID: 'DclHome001.Watcher',
      HBBTV_LINK_METADATA: 'http://samsung.com/tv/metadata/hbbtv.link',
      HBBTV_APP_ID: 'org.tizen.hbbtv',
      STORE_PACKAGE: /^[a-z0-9]{10}$/, HIDDEN_APPS: /^$/,
      STORE_APP_IDS: [], DEFAULT_HOME_APPS: [], FIREPLACE_ID: '__fire'
    },
    tizen: {
      application, tvwindow,
      ApplicationControl: function (op) { this.operation = op; },
      ApplicationControlData: function (key, values) {
        this.key = key; this.values = values;
      }
    },
    catalog: { preloadedStoreId: id => id },
    tiles: { shortName: name => name, ICONS: {} },
    toast: s => toasts.push(s),
    settings: { inputNames: {} },
    homeScreen: { buildRows() {} },
    el() { return {}; }
  };
  window.AeroTizen = A;
  const context = vm.createContext({ window, document: doc, XMLHttpRequest: XHR });
  vm.runInContext(source('homewatch.js'), context);
  vm.runInContext(source('native-handoff.js'), context);
  vm.runInContext(source('apps.js'), context);
  vm.runInContext(source('inputs.js'), context);
  return { A, http, apps, controls, sources, toasts, timers, events, doc };
}

test('Samsung Home waits for /leave acknowledgement and does not exit launcher', () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  h.A.homewatch.openSamsungHome();
  assert.equal(h.http.length, 1);
  assert.match(h.http[0].url, /\/leave$/);
  assert.equal(h.apps.length, 0);
  h.http[0].respond(200);
  assert.equal(h.apps[0].id, 'com.samsung.tv.csfs');
});

test('existing Samsung Home shortcut uses native route', () => {
  const h = harness();
  h.A.homewatch.useSamsungHome();
  assert.match(h.http[0].url, /\/leave$/);
  h.http[0].respond(200);
  assert.equal(h.apps[0].id, 'com.samsung.tv.csfs');
});

test('failed Samsung Home launch rearms HomeWatcher', () => {
  const h = harness();
  h.A.homewatch.openSamsungHome();
  h.http[0].respond(200);
  h.apps[0].fail();
  assert.match(h.http[h.http.length - 1].url, /\/home$/);
  assert.match(h.toasts[0], /Could not open Samsung Home/);
});

test('Live TV selects the actual tuner before launching native viewer', () => {
  const h = harness();
  const s = { type: 'TV', number: 1 };
  h.A.inputs.show(s);
  assert.match(h.http[0].url, /\/leave$/);
  assert.equal(h.sources.length, 0);
  h.http[0].respond(200);
  assert.equal(h.sources[0].s, s);
  assert.equal(h.sources[0].target, 'MAIN');
  assert.equal(h.apps.length, 0);
  h.sources[0].ok();
  assert.equal(h.apps[0].id, 'org.tizen.tv-viewer');
});

test('Live TV launch accepted but not foreground rearms watcher', () => {
  const h = harness();
  h.A.inputs.show({ type: 'TV', number: 1 });
  h.http[0].respond(200);
  h.sources[0].ok();
  h.apps[0].ok();
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 2100);
  h.timers[0].fn();
  assert.match(h.http[h.http.length - 1].url, /\/home$/);
});

test('Live TV foreground transition does not prematurely rearm', () => {
  const h = harness();
  h.A.inputs.show({ type: 'TV', number: 1 });
  h.http[0].respond(200);
  h.sources[0].ok();
  h.apps[0].ok();
  h.doc.hidden = true;
  h.timers[0].fn();
  assert.equal(h.http.length, 1);
});

test('HDMI continues through original TVWindow without /leave', () => {
  const h = harness();
  h.A.inputs.show({ type: 'HDMI', number: 2 });
  assert.equal(h.http.length, 0);
  assert.equal(h.sources.length, 1);
  assert.equal(h.apps.length, 0);
});

test('YouTube waits for watcher ACK before starting the preloaded app', () => {
  const h = harness();
  h.A.apps.launch({ id: 'yt', name: 'YouTube' });
  assert.equal(h.apps.length, 0);
  assert.match(h.http[0].url, /\/leave$/);
  h.http[0].respond(200);
  assert.equal(h.apps[0].id, 'yt');
});

test('YouTube watcher failure never launches without an ACK', () => {
  const h = harness();
  h.A.apps.launch({ id: 'yt', name: 'YouTube' });
  h.http[0].respond(503);
  assert.equal(h.apps.length, 0);
  assert.match(h.http[h.http.length - 1].url, /\/home$/);
});

test('Netflix follows the upstream watcher path, not YouTube handoff', () => {
  const h = harness();
  h.A.apps.launch({ id: 'netflix', name: 'Netflix' });
  assert.equal(h.apps[0].id, 'netflix');
  assert.equal(h.http.length, 1);
  assert.match(h.http[0].url, /\/watch\?id=netflix$/);
});

test('returning after a native app reloads rearms the watcher', () => {
  const h = harness();
  h.events['window:load']();
  assert.match(h.http[h.http.length - 1].url, /\/home$/);
});

test('HbbTV metadata route remains before ordinary app launch', () => {
  const h = harness();
  h.A.tizen.application.getAppMetaData = () => [
    { key: h.A.config.HBBTV_LINK_METADATA, value: 'https://example.invalid/hbbtv' }
  ];
  h.A.apps.launch({ id: 'app1', name: 'Channel' });
  assert.equal(h.apps.length, 0);
  assert.equal(h.controls[0].id, 'org.tizen.hbbtv');
});

test('native Samsung scripts load before app and source controllers', () => {
  const html = fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8');
  const a = html.indexOf('src="js/homewatch.js"');
  const b = html.indexOf('src="js/native-handoff.js"');
  const c = html.indexOf('src="js/apps.js"');
  const d = html.indexOf('src="js/inputs.js"');
  assert.ok(a >= 0 && a < b && b < c && c < d);
});
