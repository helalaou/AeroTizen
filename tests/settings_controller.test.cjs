const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const ts = require('typescript');

const compiled = ts.transpileModule(
  readFileSync(path.join(__dirname, '../launcher/src/settings/controller.ts'), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS } }
).outputText;

function harness() {
  const calls = { saves: 0, renders: 0, focus: 0, moves: 0, clock: 0 };
  const callbacks = [];
  const classes = new Set();
  const editor = { hidden: true };
  let selected;
  const navigation = {
    reset(key) { selected = key; },
    select(key) { selected = key; },
    invalidate() {},
    focus() { calls.focus++; },
    current() { return { dataset: { key: selected }, click() {} }; },
    move() { calls.moves++; }
  };
  const A = {
    config: { KEY: { LEFT: 37, RIGHT: 39, UP: 38, DOWN: 40, ENTER: 13, ESC: 27, BACK: 10009 },
      SPEED: { MIN: 0.2, MAX: 2, STEP: 0.1 } },
    settings: { background: 'black', home: ['one'], inputNames: {}, speed: 1,
      save() { calls.saves++; } },
    clock: { tick() { calls.clock++; } }, network: { updateVisibility() {} },
    inputs: { render() {} }, homeScreen: { render() {} },
    apps: { openStore() {} }, homewatch: { useSamsungHome() {} },
    $() { return editor; }, clearFocus() {}, toast() {}, hideToast() {}, applyBackground() {}
  };
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    document: { body: { classList: {
      add(...items) { items.forEach(item => classes.add(item)); },
      remove(...items) { items.forEach(item => classes.delete(item)); }
    } } },
    window: { Weather: {
      searchLocations(query, callback) { callbacks.push(callback); },
      updateVisibility() {}, updateDisplay() {}, refresh() {}
    }, Backgrounds: { setSpeed() {} } }
  };
  vm.runInNewContext(compiled, context);
  let snapshot;
  const controller = context.module.exports.createSettingsController(A, navigation, next => {
    calls.renders++;
    snapshot = next;
  });
  controller.open();
  return { A, calls, classes, callbacks, controller, navigation, get snapshot() { return snapshot; } };
}

test('named actions persist settings and leave existing snapshots unchanged', () => {
  const h = harness();
  const before = h.snapshot;
  h.controller.actions.toggleApp('two');
  assert.deepEqual(Array.from(before.settings.home), ['one']);
  assert.deepEqual(Array.from(h.A.settings.home), ['one', 'two']);
  h.controller.actions.setTimeFormat('24');
  assert.equal(h.A.settings.timeFormat, '24');
  assert.equal(h.A.settings.showTime, true);
  assert.equal(h.calls.clock, 1);
  assert.equal(h.calls.saves, 2);
  h.controller.actions.setTimeFormat('none');
  assert.equal(h.A.settings.showTime, false);
  h.controller.actions.saveInputName('HDMI 1', 'Console');
  assert.equal(h.A.settings.inputNames['HDMI 1'], 'Console');
  h.controller.actions.saveInputName('HDMI 1', '');
  assert.equal('HDMI 1' in h.A.settings.inputNames, false);
});

test('stale searches cannot apply after query edits, location selection or sheet close', () => {
  for (const cancel of [
    h => h.controller.actions.setQuery('Changed'),
    h => h.controller.actions.setLocation(null),
    h => { h.controller.close(); h.controller.open(); }
  ]) {
    const h = harness();
    h.controller.actions.setQuery('Example');
    h.controller.actions.search();
    assert.equal(h.snapshot.search.message, 'Searching…');
    cancel(h);
    h.callbacks[0]([{ label: 'Stale' }]);
    assert.equal(h.snapshot.search.results.length, 0);
    assert.equal(h.snapshot.search.message, '');
  }
});

test('remote arrows change focus without renders or persistence; preview consumes its exit key', () => {
  const h = harness();
  const before = h.calls.renders;
  const event = { preventDefault() {} };
  h.controller.keydown(40, event);
  assert.equal(h.calls.moves, 1);
  assert.equal(h.calls.renders, before);
  assert.equal(h.calls.saves, 0);
  h.controller.actions.preview();
  h.controller.keydown(40, event);
  assert.equal(h.classes.has('previewing'), false);
  assert.equal(h.calls.moves, 1);
  h.controller.keydown(27, event);
  assert.equal(h.controller.isOpen(), false);
  assert.equal(h.classes.has('editing'), false);
});
