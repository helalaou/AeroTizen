const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/load_typescript.cjs');
const { createSettingsInventory } = loadTypeScript('launcher/src/settings/services/createSettingsInventory.ts');

test('inventory publishes immutable app and input snapshots and disposes both subscriptions', () => {
  const appListeners = new Set(), inputListeners = new Set();
  const subscribe = listeners => listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const runtime = {
    apps: { all: [{ id: 'one', name: 'One' }], subscribe: subscribe(appListeners) },
    inputs: { sources: [{ type: 'HDMI', number: 1, editName: 'Console' }, { type: 'TV', number: 1 }],
      portName: source => source.type + ' ' + source.number, subscribe: subscribe(inputListeners) }
  };
  const inventory = createSettingsInventory(runtime);
  const initial = inventory.getSnapshot();
  let updates = 0;
  const unsubscribe = inventory.subscribe(() => updates++);
  [...appListeners, ...inputListeners].forEach(listener => listener());
  assert.equal(inventory.getSnapshot(), initial, 'unchanged callbacks retain snapshot identity');
  assert.deepEqual(initial.inputs, [{ port: 'HDMI 1', placeholder: 'Console' }]);
  runtime.apps.all[0].name = 'Renamed';
  [...appListeners].forEach(listener => listener());
  const renamed = inventory.getSnapshot();
  assert.equal(renamed.apps[0].name, 'Renamed');
  assert.equal(initial.apps[0].name, 'One', 'source mutation cannot change an old snapshot');
  assert.equal(renamed.inputs, initial.inputs, 'independent inventory retains identity');
  runtime.inputs.sources.push({ type: 'HDMI', number: 2 });
  [...inputListeners].forEach(listener => listener());
  const added = inventory.getSnapshot();
  assert.equal(added.apps, renamed.apps);
  assert.equal(added.inputs.length, 2);
  assert.equal(updates, 2);
  assert.throws(() => added.apps.push({ id: 'bad', name: 'Bad' }), TypeError);
  assert.equal(Object.isFrozen(added.apps[0]), true);
  assert.equal(Object.isFrozen(added.inputs[0]), true);
  unsubscribe(); inventory.dispose();
  assert.equal(appListeners.size, 0);
  assert.equal(inputListeners.size, 0);
});


test('feed status updates reach Settings and release their subscription', () => {
  const listeners = new Set();
  const runtime = {
    apps: { all: [], subscribe: () => () => {} },
    inputs: { sources: [], subscribe: () => () => {} },
    continueWatching: { sources: [{ id: 'app', name: 'Video', storeId: '123', status: 'Not selected' }], message: '',
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } }
  };
  const inventory = createSettingsInventory(runtime);
  const first = inventory.getSnapshot();
  runtime.continueWatching.sources[0].status = 'No items available';
  [...listeners].forEach(fn => fn());
  const next = inventory.getSnapshot();
  assert.equal(first.continueSources[0].status, 'Not selected');
  assert.equal(next.continueSources[0].status, 'No items available');
  assert.equal(Object.isFrozen(next.continueSources[0]), true);
  assert.equal(first.apps, next.apps);
  inventory.dispose(); assert.equal(listeners.size, 0);
});
