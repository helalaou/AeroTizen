'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const createStore = require('../launcher/service/home-store');
const createMode = require('../launcher/service/home-mode');
test('private storage commits atomically and reloads a pending handoff',
  { skip: process.platform === 'win32' && 'TV directory fsync requires a POSIX filesystem' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerotizen-mode-test-'));
  try {
    let store;
    createStore({ filesystem: { resolve(name, done, failed, mode) {
      assert.equal(name, 'wgt-private'); assert.equal(mode, 'rw');
      done({ toURI: () => pathToFileURL(directory).href });
    } } }, value => { store = value; });
    const mode = createMode(store, () => {});
    const result = mode.change({ expected_mode: 'watcher', expected_transaction: null, expected_baseline_sha256: null,
      mode: 'hold', transaction: 'a'.repeat(32), baseline_sha256: 'b'.repeat(64) });
    assert.equal(result.mode, 'hold');
    assert.equal(createMode(store, () => {}).read().mode, 'hold');
    const files = fs.readdirSync(directory); assert.deepEqual(files, ['aerotizen-home-routing-v1.json']);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(directory, files[0])).mode & 0o777, 0o600);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('failed private storage resolution stays blocked; absent API cannot permit a handoff', () => {
  createStore({ filesystem: { resolve(name, done, failed) { failed(); } } }, (store, failed) => {
    assert.equal(store, null); assert.equal(failed, true);
    assert.equal(createMode(store, () => {}, failed).read().mode, 'blocked');
  });
  createStore({}, store => { assert.equal(createMode(store, () => {}).read().persistent, false); });
});
test('private storage rejects nonlocal directory URIs', () => {
  createStore({ filesystem: { resolve(name, done) { done({ toURI: () => 'https://example.com/' }); } } }, (store, failed) => {
    assert.equal(store, null); assert.equal(failed, true);
  });
});

// A Tizen service always uses POSIX paths. Map that API to host files so Windows
// exercises real file writes/rename/readback too, with directory fsync modelled.
function portableStore(directory, events, failDirectorySync) {
  const virtual = '/private/storage with spaces';
  const parent = Symbol('directory descriptor');
  function local(name) {
    assert.equal(name.startsWith(virtual + '/'), true);
    return path.join(directory, name.slice(virtual.length + 1));
  }
  const adapter = {
    statSync: name => fs.statSync(local(name)),
    readFileSync: (name, encoding) => fs.readFileSync(local(name), encoding),
    writeFileSync: (descriptor, value, encoding) => fs.writeFileSync(descriptor, value, encoding),
    openSync(name, flags, mode) {
      if (name === virtual) { assert.equal(flags, 'r'); return parent; }
      return fs.openSync(local(name), flags, mode);
    },
    fsyncSync(descriptor) {
      events.push(descriptor === parent ? 'directory-sync' : 'file-sync');
      if (descriptor === parent) {
        if (failDirectorySync) throw new Error('directory sync failed');
      } else fs.fsyncSync(descriptor);
    },
    closeSync(descriptor) { if (descriptor !== parent) fs.closeSync(descriptor); },
    renameSync(from, to) { events.push('rename'); fs.renameSync(local(from), local(to)); },
    unlinkSync: name => fs.unlinkSync(local(name))
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../launcher/service/home-store'), 'utf8'), {
    module, require(name) { assert.equal(name, 'fs'); return adapter; }
  });
  let storage;
  module.exports({ filesystem: { resolve(name, done) {
    done({ toURI: () => 'file:///private/storage%20with%20spaces' });
  } } }, (value, failed) => { assert.equal(failed, false); storage = value; });
  return storage;
}

test('private storage handoff persists on any host through the Tizen filesystem contract', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerotizen-portable-mode-'));
  const events = [];
  try {
    const storage = portableStore(directory, events, false);
    const mode = createMode(storage, () => {});
    mode.change({ expected_mode: 'watcher', expected_transaction: null, expected_baseline_sha256: null,
      mode: 'hold', transaction: 'a'.repeat(32), baseline_sha256: 'b'.repeat(64) });
    assert.equal(createMode(portableStore(directory, [], false), () => {}).read().mode, 'hold');
    mode.change({ expected_mode: 'hold', expected_transaction: 'a'.repeat(32), expected_baseline_sha256: 'b'.repeat(64),
      mode: 'native', transaction: 'a'.repeat(32), baseline_sha256: 'b'.repeat(64) });
    assert.equal(createMode(portableStore(directory, [], false), () => {}).read().mode, 'native');
    assert.deepEqual(events, ['file-sync', 'rename', 'directory-sync', 'file-sync', 'rename', 'directory-sync']);
    assert.deepEqual(fs.readdirSync(directory), ['aerotizen-home-routing-v1.json']);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('private storage directory-sync failure blocks handoff on any host', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerotizen-portable-mode-failure-'));
  try {
    const events = [];
    const mode = createMode(portableStore(directory, events, true), () => {});
    assert.throws(() => mode.change({ expected_mode: 'watcher', expected_transaction: null, expected_baseline_sha256: null,
      mode: 'hold', transaction: 'a'.repeat(32), baseline_sha256: 'b'.repeat(64) }), /directory sync failed/);
    assert.equal(mode.read().mode, 'blocked');
    assert.deepEqual(events, ['file-sync', 'rename', 'directory-sync']);
    assert.deepEqual(fs.readdirSync(directory), ['aerotizen-home-routing-v1.json']);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
