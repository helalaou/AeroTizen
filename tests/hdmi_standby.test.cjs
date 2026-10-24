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
