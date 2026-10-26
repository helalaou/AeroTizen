const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/load_typescript.cjs');
const { createSettingsStore } = loadTypeScript('launcher/src/settings/state/createSettingsStore.ts');
const { createStore } = loadTypeScript('launcher/src/shared/state/createStore.ts');
const { createSettingsActions } = loadTypeScript('launcher/src/settings/state/createSettingsActions.ts');
const { createSettingsBridge } = loadTypeScript('launcher/src/settings/services/createSettingsBridge.ts');

const harness = () => {
  const listeners = new Set();
  let saves = 0;
  const defaults = { background: 'black', home: ['one'], inputNames: {}, speed: 1,
    cardSize: 'big', showWeather: true, showTime: true, showNetwork: true, tempUnit: 'C',
    weatherLocation: null, weatherShowLocation: true, dateFormat: 'short', timeFormat: '24',
    showLiveTv: true, hideDisconnectedHdmi: false };
  const source = { ...defaults,
    save() { saves++; [...listeners].forEach(listener => listener()); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
  const settings = createSettingsStore(source, defaults);
  const calls = [];
  const services = { config: { SPEED: { MIN: 0.2, MAX: 2, STEP: 0.1 } } };
  for (const name of ['applyBackground', 'applyWeatherVisibility', 'applyLocationVisibility', 'refreshWeather',
    'applyClock', 'applyNetworkVisibility', 'applyInputs', 'applyCardSize', 'applySpeed',
    'openStore', 'useSamsungHome', 'showPreviewMessage', 'hidePreviewMessage', 'clearHomeFocus', 'finishEditing']) {
    services[name] = (...args) => calls.push([name, ...args]);
  }
  const view = createStore({ open: false, previewing: false, mounted: false, openedAt: 0, adjusting: false });
  const transaction = action => action();
  const actions = createSettingsActions(settings, services, view, transaction);
  let now = 1000;
  const bridge = createSettingsBridge(settings, view, services, transaction, () => now++);
  return { source, settings, actions, view, bridge, calls, listeners, get saves() { return saves; } };
};

test('one source publishes stable immutable snapshots for actions and legacy writes', () => {
  const h = harness();
  let updates = 0;
  const unsubscribe = h.settings.subscribe(() => updates++);
  const before = h.settings.getSnapshot();
  assert.equal(before, h.settings.getSnapshot(), 'reads do not allocate');
  h.source.save();
  assert.equal(updates, 0, 'unchanged save does not notify the view');
  h.actions.setTimeFormat('12');
  const time = h.settings.getSnapshot();
  assert.equal(time.home, before.home, 'unrelated arrays retain identity');
  assert.equal(time.inputNames, before.inputNames);
  h.source.home.push('external');
  h.source.inputNames['HDMI 1'] = 'Console';
  h.source.weatherLocation = { name: 'Example', latitude: 1, longitude: 2 };
  h.source.save();
  const external = h.settings.getSnapshot();
  assert.deepEqual(before.home, ['one']);
  assert.deepEqual(before.inputNames, {});
  assert.deepEqual(external.home, ['one', 'external']);
  assert.equal(external.inputNames['HDMI 1'], 'Console');
  h.source.weatherLocation.name = 'Changed'; h.source.save();
  assert.equal(external.weatherLocation.name, 'Example', 'nested source mutations cannot alter old snapshots');
  assert.throws(() => external.home.push('forbidden'), TypeError);
  assert.equal(updates, 3);
  unsubscribe(); h.actions.setTimeFormat('24');
  assert.equal(updates, 3);
  h.settings.dispose();
  assert.equal(h.listeners.size, 0, 'source subscription is removed on disposal');
});

test('actions persist preferences and invoke only the relevant service', () => {
  const h = harness();
  const cases = [
    ['setBackground', 'aurora', 'background', 'applyBackground'],
    ['setWeatherVisible', false, 'showWeather', 'applyWeatherVisibility'],
    ['setLocationVisible', false, 'weatherShowLocation', 'applyLocationVisibility'],
    ['setTempUnit', 'F', 'tempUnit', 'refreshWeather'],
    ['setDateFormat', 'iso', 'dateFormat', 'applyClock'],
    ['setNetworkVisible', false, 'showNetwork', 'applyNetworkVisibility'],
    ['setLiveTvVisible', false, 'showLiveTv', 'applyInputs'],
    ['setCardSize', 'small', 'cardSize', 'applyCardSize'],
    ['setHdmiVisibility', true, 'hideDisconnectedHdmi', 'applyInputs'],
    ['setLocation', { name: 'Example', latitude: 1, longitude: 2 }, 'weatherLocation', 'refreshWeather']
  ];
  for (const [action, value, key, service] of cases) {
    h.calls.length = 0;
    h.actions[action](value);
    assert.deepEqual(h.source[key], value);
    assert.deepEqual(h.calls, [[service]]);
  }
  assert.equal(h.saves, cases.length);
  h.actions.setTimeFormat('none'); assert.equal(h.source.showTime, false);
  h.actions.setTimeFormat('24'); assert.equal(h.source.showTime, true);
  h.actions.saveInputName('HDMI 1', 'Console');
  const saves = h.saves;
  h.actions.saveInputName('HDMI 1', 'Console'); assert.equal(h.saves, saves, 'unchanged blur does not save twice');
  h.actions.saveInputName('HDMI 1', ''); assert.deepEqual(h.source.inputNames, {});
  h.actions.toggleApp('two'); assert.deepEqual(h.source.home, ['one', 'two']);
  h.actions.toggleApp('one'); h.actions.toggleApp('two'); assert.deepEqual(h.source.home, []);
  for (let i = 0; i < 30; i++) h.actions.setSpeed(-1);
  assert.equal(h.source.speed, 0.2);
  for (let i = 0; i < 30; i++) h.actions.setSpeed(1);
  assert.equal(h.source.speed, 2);
});

test('key-router bridge delegates to current handlers and releases them on cleanup', () => {
  const h = harness();
  h.source.background = 'aurora'; // open also refreshes unsaved runtime changes
  h.bridge.open();
  assert.equal(h.settings.getSnapshot().background, 'aurora');
  assert.equal(h.bridge.isOpen(), true);
  assert.deepEqual(h.view.getSnapshot(), { open: true, previewing: false, mounted: true, adjusting: false, openedAt: 1000 });
  h.bridge.open();
  assert.equal(h.view.getSnapshot().openedAt, 1000, 'repeated open preserves the preview timestamp');
  const events = [];
  const old = h.bridge.register({ focus() { events.push('old'); }, blur() {}, keydown() {} });
  const current = h.bridge.register({ focus() { events.push('focus'); }, blur() { events.push('blur'); },
    keydown(code) { events.push(code); } });
  old(); h.bridge.focus(); h.bridge.keydown(40, { preventDefault() {} });
  h.actions.preview(); assert.equal(h.view.getSnapshot().previewing, true);
  h.bridge.close();
  assert.deepEqual(events, ['focus', 40, 'blur']);
  assert.deepEqual(h.view.getSnapshot(), { open: false, previewing: false, mounted: true, adjusting: false, openedAt: 1000 });
  current(); h.bridge.focus(); h.bridge.keydown(13, { preventDefault() {} });
  assert.equal(events.length, 3);
  assert.equal(h.calls.filter(([name]) => name === 'finishEditing').length, 1);
  h.bridge.open();
  assert.equal(h.view.getSnapshot().openedAt, 1001, 'a new opening captures a fresh preview timestamp');
});
