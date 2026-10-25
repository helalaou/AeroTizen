'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const createStore = require('../launcher/service/home-store');
const createMode = require('../launcher/service/home-mode');
test('private storage commits atomically and reloads a pending handoff', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerotizen-mode-test-'));
  try {
    let store;
    createStore({ filesystem: { resolve(name, done, failed, mode) {
      assert.equal(name, 'wgt-private'); assert.equal(mode, 'rw');
      done({ toURI: () => 'file://' + directory });
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
