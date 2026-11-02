'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const create = require('../launcher/js/diagnostics');
const source = fs.readFileSync(require.resolve('../launcher/js/diagnostics'), 'utf8');

test('TV logs retain recent events within both count and encoded response limits', () => {
  const logger = create('service');
  for (let i = 0; i < 500; i++) logger.record('ui.visibility', { reason: '😀'.repeat(200), component: '界'.repeat(200) });
  const snapshot = logger.snapshot();
  assert.ok(snapshot.records.length > 0 && snapshot.records.length <= 200);
  assert.equal(snapshot.records.at(-1).event, 'ui.visibility');
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 256 * 1024);
  snapshot.records[0].data.reason = 'mutated';
  assert.notEqual(logger.snapshot().records[0].data.reason, 'mutated');
});

test('TV logs allowlist fields, redact private values and deduplicate events', () => {
  // Synthetic input generated for this test; never used for authentication.
  const hidden = require('node:crypto').randomBytes(16).toString('hex');
  const logger = create('ui');
  logger.record('ui.appcontrol', {
    operation: 'http://tizen.org/appcontrol/operation/main',
    reason: 'token=SECRET http://192.0.2.1/account?authkey=SECRET /Users/person/private',
    transaction: 'a'.repeat(32), payload: 'PRIVATE-CONTENT', password: hidden
  });
  const original = logger.snapshot().records;
  assert.equal(original[0].data.operation, 'http://tizen.org/appcontrol/operation/main');
  assert.equal(logger.ingest(original), true);
  logger.ingest([{ source: 'ui', id: 'bad id', at: 0, event: 'invalid' }, null]);
  assert.equal(logger.snapshot().records.length, 1);
  const raw = JSON.stringify(logger.snapshot());
  for (const value of ['SECRET', 'PRIVATE-CONTENT', hidden, '192.0.2.1', '/Users/person', 'a'.repeat(32)]) assert.ok(!raw.includes(value), value);
});

function clock() {
  const timers = new Map(); let now = 0, serial = 0;
  return {
    timers,
    later(fn, ms) { const id = ++serial; timers.set(id, { at: now + ms, fn }); return id; },
    cancel(id) { timers.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      now = end;
    }
  };
}

test('records and ingestion only update memory; burst writes are batched and serialized', () => {
  const c = clock(), writes = [], finish = [];
  let loaded;
  const logger = create('service', { later: c.later });
  logger.attach({ load: done => { loaded = done; }, save: (value, done) => { writes.push(JSON.parse(value)); finish.push(done); } });
  for (let i = 0; i < 100; i++) logger.record('ui.visibility');
  assert.equal(writes.length, 0); assert.equal(logger.snapshot().records.length, 100);
  loaded(null, null); c.advance(499); assert.equal(writes.length, 0);
  c.advance(1); assert.equal(writes.length, 1); assert.equal(writes[0].length, 100);
  logger.record('ui.loaded'); c.advance(5000); assert.equal(writes.length, 1);
  finish.shift()(null); c.advance(500); assert.equal(writes.length, 2);
  assert.equal(writes[1].at(-1).event, 'ui.loaded');
  finish.shift()(null); c.advance(60000); assert.equal(writes.length, 2);
  logger.ingest(logger.snapshot().records); c.advance(60000); assert.equal(writes.length, 2);
});

test('async reload merges previous events with new actions; storage failures stay optional', () => {
  const c = clock(); let saved;
  const storage = { load: done => done(null, saved), save: (value, done) => { saved = value; done(null); } };
  const first = create('service', { later: c.later }); first.attach(storage); first.record('service.start');
  assert.equal(saved, undefined); c.advance(500);
  const next = create('service', { later: c.later }); next.record('ui.start'); next.attach(storage);
  assert.deepEqual(next.snapshot().records.map(r => r.event), ['service.start', 'ui.start']);
  const broken = create('service', { later: c.later }); broken.record('ui.start');
  broken.attach({ load: done => done(null, '{bad json'), save: (value, done) => done(new Error('disk full')) });
  broken.record('ui.loaded'); c.advance(500); broken.record('ui.loaded');
  assert.equal(broken.snapshot().records.at(-1).event, 'ui.loaded');
  assert.equal(c.timers.size, 0);
});

function browser(options = {}) {
  const listeners = {}, stored = new Map(options.saved ? [['snapshot', JSON.stringify(options.saved)]] : []), requests = [], c = clock();
  let writes = 0;
  const window = {
    AeroDiagnosticsPrivacy: require('../launcher/js/diagnostics-privacy'),
    document: { hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    setTimeout: c.later, clearTimeout: c.cancel,
    AeroDiagnosticsStorage: ready => ready({
      load: done => c.later(() => done(null, stored.get('snapshot')), options.loadDelay || 0),
      save: (value, done) => { writes++; c.later(() => { stored.set('snapshot', value); done(null); }, 0); }
    }),
    localStorage: { getItem: name => stored.get(name), setItem: (name, value) => stored.set(name, value) },
    XMLHttpRequest: function () {
      const request = this;
      requests.push(this);
      this.open = (method, url) => { this.method = method; this.url = url; };
      this.setRequestHeader = () => {};
      this.send = value => {
        this.body = value;
        if (options.fail) this.onerror();
        else {
          request.status = options.status || 200;
          request.responseText = options.badAck ? '{}' : JSON.stringify({ schema_version: 1, accepted: JSON.parse(value).records.length });
          request.onload();
        }
      };
    }
  };
  if (options.tv) window.tizen = { application: { getCurrentApplication: () => ({ getRequestedAppControl: () => ({
    appControl: { operation: 'http://tizen.org/appcontrol/operation/main', data: [{ value: 'PRIVATE-PAYLOAD' }] }
  }) }) } };
  vm.runInNewContext(source, { window }, { filename: 'diagnostics.js' });
  return { window, listeners, requests, stored, timers: c.timers, advance: c.advance, options, writes: () => writes };
}

test('desktop preview logs lifecycle locally without service requests', () => {
  const h = browser(); h.listeners.load(); h.listeners.visibilitychange();
  assert.equal(h.writes(), 0); h.advance(500);
  assert.equal(h.requests.length, 0);
  assert.equal(h.window.AeroDiagnostics.snapshot().records.at(-1).event, 'ui.visibility');
  assert.ok(h.stored.get('snapshot'));
});

test('UI sends bounded event batches with sanitized error context', () => {
  const h = browser({ tv: true });
  for (let i = 0; i < 100; i++) h.window.AeroDiagnostics.record('ui.test', { reason: '界'.repeat(150) });
  h.listeners.load(); h.listeners.appcontrol();
  h.listeners.error({ error: { name: 'TypeError', message: 'payload PRIVATE-MESSAGE' }, lineno: 7 });
  h.listeners.unhandledrejection({ reason: { name: 'NetworkError', message: 'account PRIVATE-REASON' } });
  assert.equal(h.requests.length, 0); assert.equal(h.writes(), 0); h.advance(0);
  assert.ok(h.requests.length > 1);
  for (const request of h.requests) {
    assert.equal(request.method, 'POST'); assert.equal(request.url, 'http://127.0.0.1:47790/diagnostics/events');
    assert.ok(JSON.parse(request.body).records.length <= 24); assert.ok(Buffer.byteLength(request.body) < 16384);
  }
  const raw = JSON.stringify(h.window.AeroDiagnostics.snapshot());
  assert.ok(!raw.includes('PRIVATE-')); assert.ok(raw.includes('TypeError'));
  const failed = browser({ tv: true, fail: true }); failed.listeners.load(); failed.advance(0);
  assert.equal(failed.requests.length, 1);
  failed.advance(60000); assert.equal(failed.requests.length, 4);
  assert.equal(failed.timers.size, 0); // Three retries, with no service or app launch API in the harness.
  failed.listeners.visibilitychange(); failed.advance(0); assert.equal(failed.requests.length, 5);
});

test('older queued UI events are delivered when async storage loads, without a remote action', () => {
  const h = browser({ tv: true, loadDelay: 1000, saved: [
    { id: 'old-ui-record', at: 1, source: 'ui', event: 'ui.loaded', data: {} }
  ] });
  h.listeners.load(); h.advance(0);
  assert.ok(!h.requests.some(request => JSON.parse(request.body).records.some(item => item.at === 1)));
  h.advance(1000);
  assert.ok(h.requests.some(request => JSON.parse(request.body).records.some(item => item.at === 1)));
});

test('cold-start delivery succeeds when the existing service becomes ready', () => {
  const h = browser({ tv: true, fail: true }); h.listeners.load(); h.advance(0);
  assert.equal(h.requests.length, 1);
  h.advance(1000); assert.equal(h.requests.length, 2);
  h.options.fail = false; h.advance(3000);
  assert.equal(h.requests.length, 3); assert.equal(h.timers.size, 0);
  const delivered = JSON.parse(h.requests.at(-1).body).records;
  assert.ok(delivered.some(item => item.event === 'ui.start'));
  assert.ok(delivered.some(item => item.event === 'ui.loaded'));
  h.advance(60000); assert.equal(h.requests.length, 3);
});

test('startup notifications share one retry schedule instead of exhausting it early', () => {
  const h = browser({ tv: true, fail: true }); h.listeners.load(); h.advance(0);
  for (let i = 0; i < 20; i++) h.window.AeroDiagnostics.flush();
  assert.equal(h.requests.length, 1);
  h.advance(1000); assert.equal(h.requests.length, 2);
  h.options.fail = false; h.advance(3000);
  assert.equal(h.requests.length, 3); assert.equal(h.timers.size, 0);
});

test('hiding the launcher cancels delivery retries; returning starts a fresh bounded attempt', () => {
  const h = browser({ tv: true, fail: true }); h.listeners.load(); h.advance(0);
  h.window.document.hidden = true; h.listeners.visibilitychange();
  h.advance(60000); assert.equal(h.requests.length, 1);
  h.window.AeroDiagnostics.flush(); assert.equal(h.requests.length, 1);
  h.window.document.hidden = false; h.listeners.visibilitychange(); h.advance(0);
  assert.equal(h.requests.length, 2);
});

test('legacy 200 responses do not discard queued events or start retry loops', () => {
  const h = browser({ tv: true, badAck: true }); h.listeners.load(); h.advance(500);
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  h.options.badAck = false; h.window.AeroDiagnostics.flush(); h.advance(0);
  assert.equal(h.requests.length, 2);
  assert.ok(JSON.parse(h.requests[1].body).records.some(item => item.event === 'ui.start'));
  const rejected = browser({ tv: true, status: 403 }); rejected.listeners.load(); rejected.advance(500);
  assert.equal(rejected.timers.size, 0);
  const busy = browser({ tv: true, status: 503 }); busy.listeners.load(); busy.advance(60000);
  assert.equal(busy.requests.length, 4); assert.equal(busy.timers.size, 0);
});

test('service log storage uses only async file APIs and preserves Home recovery on any host', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerotizen-logs-'));
  const prefix = '/virtual/private';
  const local = name => path.join(directory, name.slice(prefix.length + 1));
  const adapter = {
    stat: (name, done) => fs.stat(local(name), done),
    readFile: (name, encoding, done) => fs.readFile(local(name), encoding, done),
    writeFile: (name, value, options, done) => fs.writeFile(local(name), value, options, done),
    rename: (from, to, done) => fs.rename(local(from), local(to), done),
    unlink: (name, done) => fs.unlink(local(name), done)
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../launcher/service/diagnostics-store'), 'utf8'), {
    module, Buffer, require: name => { assert.equal(name, 'fs'); return adapter; }
  });
  try {
    let store;
    module.exports({ filesystem: { resolve: (name, done) => {
      assert.equal(name, 'wgt-private'); done({ toURI: () => 'file:///virtual/private' });
    } } }, value => { store = value; });
    const home = path.join(directory, 'aerotizen-home-routing-v1.json'); fs.writeFileSync(home, 'RECOVERY');
    const save = value => new Promise((resolve, reject) => store.save(value, error => error ? reject(error) : resolve()));
    const load = () => new Promise((resolve, reject) => store.load((error, value) => error ? reject(error) : resolve(value)));
    const logger = create('service'); logger.record('service.start');
    for (let i = 0; i < 100; i++) logger.record('ui.visibility', { reason: '界'.repeat(190), component: '界'.repeat(190) });
    let finished = false;
    const pending = save(JSON.stringify(logger.snapshot().records)).then(() => { finished = true; });
    assert.equal(finished, false); await pending;
    assert.equal(JSON.parse(await load()).at(-1).event, 'ui.visibility');
    assert.equal(fs.readFileSync(home, 'utf8'), 'RECOVERY');
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 0);
    adapter.rename = (from, to, done) => done(new Error('disk failed'));
    await assert.rejects(save('[]'), /disk failed/);
    assert.equal(JSON.parse(await load()).at(-1).event, 'ui.visibility');
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('blocked or absent IndexedDB keeps UI logs in memory without a synchronous fallback', () => {
  const open = require('../launcher/js/diagnostics-storage');
  let calls = 0, result;
  open({}, value => { calls++; result = value; }); assert.equal(result, null);
  const request = {};
  open({ indexedDB: { open: () => request } }, value => { calls++; result = value; });
  request.onblocked(); request.onerror(); assert.equal(calls, 2); assert.equal(result, null);
  let closed = false; request.result = { close: () => { closed = true; } }; request.onsuccess();
  assert.equal(closed, true); assert.equal(calls, 2);
});


test('events use session sequence and monotonic elapsed time despite wall clock changes', () => {
  let now = 100;
  const logger = create('ui', { now: () => now });
  const first = logger.record('request'); now = 150; logger.record('accepted'); now = 90; logger.record('next');
  const records = logger.snapshot().records;
  assert.equal(records[0].id, first);
  assert.deepEqual(records.map(item => item.sequence), [1, 2, 3]);
  assert.deepEqual(records.map(item => item.elapsed_ms), [0, 50, 50]);
  assert.ok(records.every(item => item.session === records[0].session));
  logger.ingest([{ id: 'legacy-event', at: 1, source: 'ui', event: 'diagnostic.unknown', data: {} }]);
  assert.equal(logger.snapshot().records.at(-1).sequence, undefined);
});

test('error formatting is deferred, bounded and contains source locations without paths or payloads', () => {
  const c = clock(), logger = create('ui', { later: c.later }); let reads = 0;
  const error = { name: 'TypeError', message: 'Cannot read value user@example.com',
    get stack() { reads++; return 'TypeError: token=SECRET\n at f (file:///Users/person/apps.js:42:9)\n at /opt/usr/native-navigation.js:55:3'; } };
  logger.captureError('app.launch_failed', error, { file: 'file:///opt/usr/apps.js?token=PRIVATE', line: 42, column: 9, payload: 'PRIVATE' });
  assert.equal(reads, 0); assert.equal(logger.snapshot().records.length, 0);
  c.advance(0);
  const data = logger.snapshot().records[0].data;
  assert.equal(data.file, 'apps.js'); assert.equal(data.line, 42); assert.equal(data.column, 9);
  assert.equal(data.stack, 'apps.js:42:9\nnative-navigation.js:55:3');
  assert.equal(data.message, 'property_access_failed');
  assert.doesNotMatch(JSON.stringify(data), /SECRET|PRIVATE|Users|opt|user@example/);
  for (let i = 0; i < 20; i++) logger.captureError('ui.error', error);
  assert.equal(logger.health().pending_errors, 16); assert.equal(logger.health().discarded, 4);
  c.advance(0); assert.equal(logger.health().pending_errors, 0);
});

test('health reports retention loss and failed storage without blocking new events', () => {
  const c = clock(), logger = create('service', { later: c.later });
  for (let i = 0; i < 205; i++) logger.record('ui.visibility');
  assert.equal(logger.health().discarded, 5); assert.equal(logger.health().storage, 'unavailable');
  logger.attach({ load: done => done(null, null), save: (value, done) => done(new Error('disk full')) });
  c.advance(500); assert.equal(logger.health().storage, 'failed'); assert.equal(logger.health().write_failures, 1);
  logger.record('ui.loaded'); assert.equal(logger.snapshot().records.at(-1).event, 'ui.loaded');
});

test('service metadata is cached once and UI health and build fields are allowlisted', () => {
  const createContext = require('../launcher/service/diagnostics-context');
  let calls = 0, finish;
  const context = createContext({ read: done => { calls++; finish = done; } });
  const snapshot = () => context.enrich({}, { mode: 'native', persistent: true, protocol: 1 }, { heartbeats: 0, guard: { launchCalls: 0 } });
  context.start(); context.start(); assert.equal(calls, 1); assert.equal(snapshot().environment.state, 'loading');
  finish(null, 'VERSION_ID="9.0.0"\nBUILD_ID="T-TEST-0090"\nSECRET="PRIVATE"');
  context.accept({ version: '2.4.0', build: { version: '2.4.0', build_id: 'a'.repeat(64), commit: 'b'.repeat(40), dirty: true, path: 'PRIVATE' },
    health: { session: 'ui-session', storage: 'failed', discarded: 7, token: 'PRIVATE' }, queued: 3,
    delivery: { state: 'acknowledged', retries: 1, last_status: 200 }, payload: 'PRIVATE' });
  const info = snapshot();
  assert.equal(info.environment.tizen, '9.0.0'); assert.equal(info.environment.firmware, 'T-TEST-0090');
  assert.equal(info.ui.build.build_id, 'a'.repeat(64)); assert.equal(info.ui.health.discarded, 7);
  assert.match(info.ui.health.session, /^d-[a-f0-9]{8}-[0-9]+$/); assert.equal(info.ui.queued, 3);
  assert.equal(info.context.native_settings, 'not_queried'); assert.doesNotMatch(JSON.stringify(info), /PRIVATE/);
});


test('sanitization remains stable after service delivery and persistence reload', () => {
  const c = clock(), ui = create('ui', { later: c.later });
  ui.captureError('ui.error', { name: 'TypeError', message: 'Cannot read value', stack: 'TypeError: Cannot read value\n at f (file:///opt/apps.js:12:4)\n at file:///opt/main.js:90:2' });
  c.advance(0);
  const service = create('service'); service.ingest(ui.snapshot().records);
  assert.equal(service.snapshot().records[0].data.stack, ui.snapshot().records[0].data.stack);
  ui.record('watcher.launch', { reason: 'home pressed in private.person.app' });
  service.ingest(ui.snapshot().records);
  assert.equal(service.snapshot().records.at(-1).data.reason, 'home_pressed_in_app');
  ui.record('safe', { reason: 'authkey="PRIVATE FIRST SECOND" Authorization: Bearer HIDDEN' });
  assert.doesNotMatch(JSON.stringify(ui.snapshot()), /PRIVATE|FIRST|SECOND|HIDDEN/);
});


test('no personal strings reach memory, async saves or uploads, including legacy events', () => {
  const values = ['Alex Example', 'alex@example.invalid', '2001:db8::7', 'aa:bb:cc:dd:ee:ff',
    'My Very Private Film', 'Bedroom Television', '\\\\server\\alex\\work', 'PRIVATE-CREDENTIAL'];
  const h = browser({ tv: true });
  for (const value of values) {
    h.window.AeroDiagnostics.record('app.launch_requested', {
      app_id: value, action: value, mode: value, error: value, reason: value,
      message: value, file: value + '.js', stack: value, payload: value,
      operation_id: value, transaction: value, unknown: { [value]: value }
    });
    h.listeners.error({ message: value, filename: '/mnt/' + value + '.js', lineno: 9, colno: 3 });
  }
  h.window.AeroDiagnostics.ingest([{ id: 'alex-example', session: 'bedroom-tv', at: 1, source: 'ui', event: 'ui.error',
    data: { error: 'Alex Example', message: 'My Very Private Film', app_id: 'alex@example.invalid', token: 'PRIVATE-CREDENTIAL' } }]);
  h.listeners.load(); h.advance(500);
  const raw = JSON.stringify({ memory: h.window.AeroDiagnostics.snapshot(), saves: [...h.stored], uploads: h.requests.map(request => request.body) });
  for (const value of values.concat(['alex-example', 'bedroom-tv'])) assert.ok(!raw.includes(value), value);
  const request = h.window.AeroDiagnostics.snapshot().records.find(item => item.event === 'app.launch_requested');
  assert.match(request.data.app_id, /^app-[0-9]+$/);
});

test('app aliases remain consistent within a session and known Home IDs remain useful', () => {
  const logger = create('ui');
  logger.record('app.launch_requested', { app_id: 'third.party.private' });
  logger.record('app.launch_accepted', { app_id: 'third.party.private' });
  logger.record('app.launch_requested', { app_id: 'another.private.app' });
  logger.record('app.launch_requested', { app_id: 'com.samsung.tv.csfs' });
  const records = logger.snapshot().records;
  assert.equal(records[0].data.app_id, records[1].data.app_id);
  assert.notEqual(records[0].data.app_id, records[2].data.app_id);
  assert.equal(records[3].data.app_id, 'com.samsung.tv.csfs');
  assert.doesNotMatch(JSON.stringify(records), /third.party.private|another.private.app/);
});
