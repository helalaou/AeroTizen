const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../launcher/js/inputs.js'), 'utf8');

function setup({ filtered = false, connected = [], disconnected = [], showLiveTv = true } = {}) {
  const tiles = [];
  const classes = new Set();
  const row = {
    children: tiles, parentNode: { hidden: false },
    classList: { toggle(name, yes) {
      if (yes) classes.add(name); else classes.delete(name);
    }},
    set textContent(value) { if (value === '') tiles.length = 0; },
    appendChild(tile) { tiles.push(tile); }
  };
  const calls = [];
  let navigationBuilds = 0;
  const A = {
    settings: { inputNames: {}, hideDisconnectedHdmi: filtered, showLiveTv },
    $: id => id === 'inputs' ? row : null,
    tiles: {
      card(name, icon, onclick) {
        const classes = new Set(), labels = [];
        return {
          name, icon, onclick, labels, children: [],
          classList: { add: cls => classes.add(cls), contains: cls => classes.has(cls) },
          querySelector: selector => selector === '.name' ? {
            appendChild: el => labels.push(el)
          } : null,
          appendChild(child) { this.children.push(child); }
        };
      }
    },
    el: (tag, cls, text) => ({ tag, cls, text, setAttribute() {} }),
    homeScreen: { buildRows() { navigationBuilds++; } },
    toast() {}, applyBackground() {}
  };
  const tz = {
    systeminfo: {
      addPropertyValueChangeListener() {},
      getPropertyValue(key, next) {
        assert.equal(key, 'VIDEOSOURCE');
        next({ connected, disconnected });
      }
    },
    tvwindow: {
      setSource(src, success) { calls.push(src); success(); },
      show(success) { success(); },
      hide() {}
    }
  };
  A.tizen = tz;
  const document = {
    body: { classList: { add() {}, remove() {} } },
    documentElement: { style: {} }
  };
  vm.runInNewContext(source, {
    window: { AeroTizen: A, Backgrounds: { hide() {} } },
    document
  });
  A.inputs.load();
  return { A, row, tiles, calls, classes, get navigationBuilds() { return navigationBuilds; } };
}

test('glass dock wraps existing remote-activated source tiles without changing click handlers', () => {
  const raw = { type: 'HDMI', number: 1, editName: 'PlayStation 5' };
  const h = setup({ connected: [raw] });
  assert.equal(h.tiles.length, 1);
  assert.equal(h.tiles[0].name, 'PlayStation 5');
  assert.ok(h.tiles[0].classList.contains('aero-source-card'));
  assert.ok(h.tiles[0].classList.contains('aero-source-connected'));
  assert.match(h.tiles[0].icon, /aero-source-icon/);
  assert.match(h.tiles[0].icon, /<svg/);
  assert.equal(h.tiles[0].labels[0].text, 'HDMI 1');
  h.tiles[0].onclick();
  assert.equal(h.calls[0], raw, 'source switching must retain the original raw Tizen source');
});

test('filtered ports keep full-width tiles without changing original HDMI visibility', () => {
  const h = setup({
    filtered: true,
    connected: [{ type: 'HDMI', number: 1, editName: 'Xbox' }],
    disconnected: [{ type: 'HDMI', number: 2, editName: 'HDMI 2' }]
  });
  assert.equal(h.tiles.length, 1);
  assert.ok(h.classes.has('aero-dock-compact'));
  assert.equal(h.navigationBuilds, 1);
});

test('unfiltered ports retain dimmed empty tiles and fixed five-slot shell', () => {
  const h = setup({
    connected: [{ type: 'TV', number: 1 }],
    disconnected: [1,2,3,4].map(number => ({ type: 'HDMI', number }))
  });
  assert.equal(h.tiles.length, 5);
  assert.equal(h.classes.has('aero-dock-compact'), false);
  assert.ok(h.tiles.some(tile => tile.classList.contains('off')));
  assert.ok(h.tiles.some(tile => tile.classList.contains('aero-source-live')));
});

test('source status uses connected, active and optional recognised flags only', () => {
  const h = setup({ disconnected: [{ type: 'HDMI', number: 2 }] });
  assert.equal(h.tiles.length, 1);
  assert.equal(h.tiles[0].children.length, 0);
  assert.ok(h.tiles[0].classList.contains('off'));
});

test('source dock stylesheet preserves one visual focus outline and no blur dependency', () => {
  const css = fs.readFileSync(path.join(__dirname, '../launcher/css/source-dock.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8');
  assert.match(html, /href="css\/source-dock\.css"/);
  assert.match(css, /#inputs\.row\.small\.aero-dock-compact/);
  assert.match(css, /#inputs \.tile\.aero-source-card\.focused/);
  assert.doesNotMatch(css, /(?:-webkit-)?backdrop-filter\s*:/);
  assert.match(css, /box-shadow:\s*inset 0 1px/);
});
