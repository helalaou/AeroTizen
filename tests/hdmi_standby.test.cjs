// Tizen VIDEOSOURCE standby recognition, port de-duplication and visibility.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../launcher/js/inputs.js'), 'utf8');

function harness(settings = {}, report = {}, selected = null) {
  const tiles = [];
  const root = {
    children: tiles,
    set textContent(value) { if (value === '') { tiles.length = 0; } }
  };
  let builds = 0;
  const A = {
    settings: {
      showLiveTv: true,
      hideDisconnectedHdmi: true,
      inputNames: {},
      ...settings
    },
    $: name => name === 'inputs' ? root : null,
    tiles: {
      ICONS: { tv: 'TV', game: 'GAME', pc: 'PC', box: 'BOX', hdmi: 'HDMI' },
      card: (name, icon, onclick) => {
        const classes = new Set();
        return {
          name, icon, onclick, classes,
          classList: { add: cls => classes.add(cls) },
          querySelector: () => ({ appendChild() {} })
        };
      }
    },
    el: () => ({}),
    homeScreen: { buildRows() { builds++; } },
    applyBackground() {}
  };
  root.appendChild = tile => { tiles.push(tile); };
  const tvwindow = {
    getSource() { return selected; },
    setSource() {}
  };
  A.tizen = {
    tvwindow,
    systeminfo: {
      getPropertyValue(property, cb) {
        assert.equal(property, 'VIDEOSOURCE');
        cb(report);
      },
      addPropertyValueChangeListener() {}
    }
  };
  vm.runInNewContext(source, {
    window: { AeroTizen: A },
    document: { addEventListener() {} },
    AeroTizen: A
  });
  return { A, tiles, get builds() { return builds; } };
}

test('a recognised Samsung HDMI label survives standby with filtering enabled', () => {
  const h = harness({}, {
    connected: [],
    disconnected: [
      { type: 'HDMI', number: 1, editName: 'PlayStation 5' },
      { type: 'HDMI', number: 2, editName: 'HDMI 2' },
      { type: 'HDMI', number: 3 }
    ]
  });
  h.A.inputs.load();
  assert.deepEqual(h.tiles.map(x => x.name), ['PlayStation 5']);
  assert.equal(h.tiles[0].classes.has('off'), false);
});

test('only TV-reported names count; empty, placeholder and app-custom labels do not', () => {
  const h = harness({ inputNames: { 'HDMI 1': 'PlayStation' } });
  const recognised = h.A.inputs.hasRecognizedDevice;
  for (const name of ['HDMI 1', 'Input HDMI 2', 'Unknown device', 'Sorgente 3',
                      'Non collegato', 'Dispositivo sconosciuto', '', '  ']) {
    assert.equal(recognised({ type: 'HDMI', number: 1, editName: name }), false, name);
  }
  for (const name of ['PlayStation 5', 'Xbox Series X', 'Switch', 'Apple TV']) {
    assert.equal(recognised({ type: 'HDMI', number: 1, editName: name }), true, name);
  }
  assert.equal(recognised({ type: 'TV', editName: 'PlayStation 5' }), false);
  assert.equal(h.A.inputs.isVisible({ type: 'HDMI', number: 1, connected: false }), false);
});

test('Show all retains empty ports and Hide Live TV still works', () => {
  const h = harness({ hideDisconnectedHdmi: false, showLiveTv: false }, {
    connected: [{ type: 'TV', number: 1 }],
    disconnected: [{ type: 'HDMI', number: 1 }]
  });
  h.A.inputs.load();
  assert.deepEqual(h.tiles.map(x => x.name), ['HDMI 1']);
  assert.equal(h.tiles[0].classes.has('off'), true);
});

test('selected source remains reachable even when firmware reports disconnected', () => {
  const h = harness({}, {
    disconnected: [{ type: 'HDMI', number: 2 }]
  }, { type: 'HDMI', number: 2 });
  h.A.inputs.load();
  assert.deepEqual(h.tiles.map(x => x.name), ['HDMI 2']);
  assert.equal(h.A.inputs.sources[0].active, true);
});

test('duplicated ports prefer connected raw sources without dropping recognised names', () => {
  const connectedRaw = { type: 'HDMI', number: 1, editName: 'HDMI 1' };
  const disconnectedRaw = { type: 'HDMI', number: 1, editName: 'PlayStation 5' };
  const h = harness({}, {
    connected: [connectedRaw],
    disconnected: [disconnectedRaw, { type: 'HDMI', number: 2 }]
  });
  h.A.inputs.load();
  assert.equal(h.A.inputs.sources.length, 2);
  assert.equal(h.A.inputs.sources[0].raw, connectedRaw);
  assert.equal(h.A.inputs.sources[0].editName, 'PlayStation 5');
  assert.equal(h.A.inputs.sources[0].connected, true);
});

test('signal and MEDIA reporting keep original Tizen semantics', () => {
  const h = harness({}, {
    connected: [],
    disconnected: [{ type: 'MEDIA', number: 1 }, { type: 'HDMI', number: 1, signal: true }]
  });
  h.A.inputs.load();
  assert.equal(h.A.inputs.sources.length, 1);
  assert.equal(h.A.inputs.sources[0].connected, true);
  assert.equal(h.tiles.length, 1);
});

test('visibility with no filtering remains backward compatible', () => {
  const h = harness({ hideDisconnectedHdmi: false }, {
    disconnected: [{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 2, editName: 'Xbox' }]
  });
  h.A.inputs.load();
  assert.equal(h.tiles.length, 2);
  assert.equal(h.tiles[0].classes.has('off'), true);
  assert.equal(h.tiles[1].classes.has('off'), false);
  assert.equal(h.builds, 1);
});

test('manual per-port exception preserves an unidentified but explicitly selected HDMI input', () => {
  const h = harness({ hdmiKeepVisible: { '2': true } }, {
    disconnected: [
      { type: 'HDMI', number: 1, editName: 'HDMI 1' },
      { type: 'HDMI', number: 2, editName: 'HDMI 2' }
    ]
  });
  h.A.inputs.load();
  assert.deepEqual(h.tiles.map(x => x.name), ['HDMI 2']);
  assert.equal(h.tiles[0].classes.has('off'), false, 'a pinned port remains reachable');
  assert.equal(h.A.inputs.sources[1].connected, false, 'pinning must not invent a signal');
  assert.equal(h.A.inputs.alwaysVisible(h.A.inputs.sources[1]), true);
  h.A.settings.hdmiKeepVisible = {};
  h.A.inputs.render();
  assert.equal(h.tiles.length, 0);
});

test('Settings override controls use persisted source numbers and accept remote selection', () => {
  const source = fs.readFileSync(path.join(__dirname, '../launcher/js/settings-ui.js'), 'utf8');
  const start = source.indexOf('  function renderHdmiOverrides() {');
  const end = source.indexOf('\n\n  // OK opens the TV', start);
  assert.ok(start >= 0 && end > start);
  const box = {
    children: [],
    set textContent(value) { if (value === '') this.children.length = 0; },
    appendChild(child) { this.children.push(child); }
  };
  const S = { hdmiKeepVisible: {}, save() {} };
  let renders = 0;
  const A = {
    $: name => name === 'hdmi-force-visibility' ? box : null,
    inputs: {
      sources: [
        { type: 'HDMI', number: 3 }, { type: 'HDMI', number: 1 },
        { type: 'HDMI', number: 3 }, { type: 'TV', number: 1 }
      ],
      render() { renders++; }
    }
  };
  const pill = (key, label, selected, callback) => ({
    key, label, selected, callback, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const render = vm.runInNewContext('(' + source.slice(start, end).trim() + ')',
    { A, S, pill, changed: fn => fn(), focusKey: null });
  render();
  assert.deepEqual(box.children.map(x => x.key), ['hdmi-keep:1', 'hdmi-keep:3']);
  assert.equal(box.children[0].attributes['aria-pressed'], 'false');
  box.children[0].callback();
  assert.equal(S.hdmiKeepVisible['1'], true);
  assert.equal(renders, 1);
  render();
  assert.equal(box.children[0].attributes['aria-pressed'], 'true');
  box.children[0].callback();
  assert.equal(S.hdmiKeepVisible['1'], undefined);
  assert.match(source, /kids\('hdmi-force-visibility'\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8'),
    /id="hdmi-force-visibility"/);
});

test('HDMI per-port exceptions survive the existing official settings storage', () => {
  const store = {};
  const A = { clock: { defaultTimeFormat: () => '24' } };
  const window = { AeroTizen: A, navigator: { language: 'it-IT' } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../launcher/js/config.js'), 'utf8'),
    { window, AeroTizen: A });
  const localStorage = {
    getItem: key => store[key] || null,
    setItem: (key, data) => { store[key] = data; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../launcher/js/settings.js'), 'utf8'),
    { window, localStorage });
  A.settings.load();
  assert.equal(Object.keys(A.settings.hdmiKeepVisible).length, 0);
  A.settings.hdmiKeepVisible['2'] = true;
  A.settings.save();
  A.settings.hdmiKeepVisible = {};
  A.settings.load();
  assert.equal(A.settings.hdmiKeepVisible['2'], true);
});
