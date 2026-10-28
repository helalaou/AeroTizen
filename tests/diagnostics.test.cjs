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
  for (let i = 0; i < 500; i++) logger.record('event.' + i, { reason: '😀'.repeat(200), component: '界'.repeat(200) });
  const snapshot = logger.snapshot();
  assert.ok(snapshot.records.length > 0 && snapshot.records.length <= 200);
  assert.equal(snapshot.records.at(-1).event, 'event.499');
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

test('TV log reload merges current startup, with corrupt or failed storage kept optional', () => {
  let saved;
  const storage = { load: () => saved, save: value => { saved = value; } };
  const first = create('service'); first.attach(storage); first.record('first.start');
  const next = create('service'); next.record('second.start'); next.attach(storage);
  assert.deepEqual(next.snapshot().records.map(r => r.event), ['first.start', 'second.start']);
  const broken = create('service'); broken.record('current.start');
  broken.attach({ load: () => '{bad json', save: () => assert.fail('must not save corrupt input') });
  broken.record('still.works');
  broken.attach({ load: () => null, save: () => { throw new Error('disk full'); } });
  broken.record('after.failure');
  assert.equal(broken.snapshot().records.at(-1).event, 'after.failure');
});

function browser(options = {}) {
  const listeners = {}, stored = new Map(), requests = [];
  const window = {
    document: { hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    localStorage: { getItem: name => stored.get(name), setItem: (name, value) => stored.set(name, value) },
    XMLHttpRequest: function () {
      const request = this;
      requests.push(this);
      this.open = (method, url) => { this.method = method; this.url = url; };
      this.setRequestHeader = () => {};
      this.send = value => {
        this.body = value;
        if (options.fail) this.onerror();
        else { request.status = 200; request.onload(); }
      };
    }
  };
  if (options.tv) window.tizen = { application: { getCurrentApplication: () => ({ getRequestedAppControl: () => ({
    appControl: { operation: 'http://tizen.org/appcontrol/operation/main', data: [{ value: 'PRIVATE-PAYLOAD' }] }
  }) }) } };
  vm.runInNewContext(source, { window }, { filename: 'diagnostics.js' });
  return { window, listeners, requests, stored };
}

test('desktop preview logs lifecycle locally without service requests', () => {
  const h = browser(); h.listeners.load(); h.listeners.visibilitychange();
  assert.equal(h.requests.length, 0);
  assert.equal(h.window.AeroDiagnostics.snapshot().records.at(-1).event, 'ui.visibility');
  assert.ok(h.stored.get('aerotizen.diagnostics.v1'));
});

test('UI sends bounded event batches, logs error names only, and never retries on a timer', () => {
  const h = browser({ tv: true });
  for (let i = 0; i < 100; i++) h.window.AeroDiagnostics.record('ui.test', { reason: '界'.repeat(150) });
  h.listeners.load(); h.listeners.appcontrol();
  h.listeners.error({ error: { name: 'TypeError', message: 'PRIVATE-MESSAGE' }, lineno: 7 });
  h.listeners.unhandledrejection({ reason: { name: 'NetworkError', message: 'PRIVATE-REASON' } });
  assert.ok(h.requests.length > 1);
  for (const request of h.requests) {
    assert.equal(request.method, 'POST'); assert.equal(request.url, 'http://127.0.0.1:47790/diagnostics/events');
    assert.ok(JSON.parse(request.body).length <= 24); assert.ok(Buffer.byteLength(request.body) < 16384);
  }
  const raw = JSON.stringify(h.window.AeroDiagnostics.snapshot());
  assert.ok(!raw.includes('PRIVATE-')); assert.ok(raw.includes('TypeError'));
  const failed = browser({ tv: true, fail: true }); failed.listeners.load();
  assert.equal(failed.requests.length, 1); // No retry timer or app launch API is present in this harness.
  failed.listeners.visibilitychange(); assert.equal(failed.requests.length, 2);
});

test('service log storage uses a separate file and reloads on Windows and POSIX hosts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerotizen-logs-'));
  const prefix = '/virtual/private';
  const local = name => path.join(directory, name.slice(prefix.length + 1));
  const adapter = {
    statSync: name => fs.statSync(local(name)), readFileSync: (name, encoding) => fs.readFileSync(local(name), encoding),
    openSync: (name, flags, mode) => fs.openSync(local(name), flags, mode),
    writeFileSync: (...args) => fs.writeFileSync(...args), closeSync: fd => fs.closeSync(fd),
    renameSync: (from, to) => fs.renameSync(local(from), local(to)), unlinkSync: name => fs.unlinkSync(local(name))
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
    const logger = create('service'); logger.attach(store); logger.record('service.start');
    for (let i = 0; i < 100; i++) logger.record('unicode.test', { reason: '界'.repeat(190), component: '界'.repeat(190) });
    const restarted = create('service'); restarted.attach(store);
    assert.ok(restarted.snapshot().records.length > 0);
    assert.equal(restarted.snapshot().records.at(-1).event, 'unicode.test');
    assert.equal(fs.readFileSync(home, 'utf8'), 'RECOVERY');
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 0);
    adapter.renameSync = () => { throw new Error('disk failed'); };
    logger.record('service.failure');
    assert.equal(logger.snapshot().records.at(-1).event, 'service.failure');
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
