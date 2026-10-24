const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../launcher/', file), 'utf8');

function mockElement(tag, className = '', text = '') {
  const classes = new Set(className.split(' ').filter(Boolean));
  return {
    tagName: tag.toUpperCase(), textContent: text, children: [], style: {},
    set className(v) { classes.clear(); String(v).split(' ').filter(Boolean).forEach(x => classes.add(x)); },
    get className() { return Array.from(classes).join(' '); },
    classList: { add(x) { classes.add(x); }, contains(x) { return classes.has(x); } },
    setAttribute() {}, appendChild(item) { this.children.push(item); return item; }
  };
}
function brandHarness(mode) {
  let sourcesCalled = 0, imageInstances = 0;
  const A = {
    settings: { homeCardMode: mode },
    catalog: { brand: () => ({ background: '#083', logo: null, label: 'YouTube', textColour: '#fff' }) },
    artwork: { sources() { sourcesCalled++; return []; } },
    el: mockElement
  };
  const ctx = {
    window: { AeroTizen: A, LOGOS: {} },
    document: { createElement: tag => mockElement(tag) },
    Image: function () { imageInstances++; return mockElement('img'); }
  };
  vm.runInNewContext(read('js/brands.js'), ctx);
  return { A, get sourcesCalled() { return sourcesCalled; }, get imageInstances() { return imageInstances; } };
}

test('Square is the default; layout migration keeps older settings intact', () => {
  const A = {};
  const ctx = { window: { AeroTizen: A }, AeroTizen: A };
  vm.runInNewContext(read('js/config.js'), ctx);
  assert.equal(A.config.DEFAULTS.homeCardMode, 'square');
  assert.equal(A.config.DEFAULTS.homeCardColumns, null);
  assert.equal(A.config.DEFAULTS.cardSize, 'big');
  assert.equal(A.config.CARD_COLUMNS.big, 3);
  assert.equal(A.config.CARD_COLUMNS.small, 5);
});

test('Rectangle brand cards reuse upstream brand rendering without square artwork requests', () => {
  const h = brandHarness('rectangle');
  let launched = false;
  const card = h.A.tiles.app({ name: 'YouTube', id: 'yt', icon: '' },
    'home-display', () => { launched = true; });
  assert.equal(h.sourcesCalled, 0);
  assert.ok(card.classList.contains('brand-rectangle'));
  assert.ok(card.classList.contains('home-display'));
  assert.equal(card.children.length, 1);
  assert.equal(card.children[0].children[0].textContent, 'YouTube');
  card.onclick();
  assert.equal(launched, true);
});

test('Unknown Rectangle app uses a readable banner instead of a tiny square Tizen icon', () => {
  const original = read('js/brands.js');
  assert.match(original, /extraClass === 'home-display' && A.settings.homeCardMode === 'rectangle'/);
  assert.match(original, /!\(extraClass === 'home-display' && A.settings.homeCardMode === 'rectangle'\)/);
  const h = brandHarness('rectangle');
  const card = h.A.tiles.app({ name: 'Unknown App', id: 'unknown', icon: '/native-square.png' },
    'home-display');
  assert.equal(h.imageInstances, 0, 'rectangle must not load a square Tizen icon');
  assert.equal(h.sourcesCalled, 0, 'rectangle must not request square Samsung artwork');
  assert.ok(card.classList.contains('brand-rectangle'));
});

test('Settings app cards are unaffected by the Home rectangle selection', () => {
  const h = brandHarness('rectangle');
  const card = h.A.tiles.app({ name: 'YouTube', id: 'yt', icon: '' });
  assert.equal(h.sourcesCalled, 1);
  assert.equal(card.classList.contains('brand-rectangle'), false);
});

test('Square Home cards retain Samsung artwork resolution', () => {
  const h = brandHarness('square');
  h.A.tiles.app({ name: 'YouTube', id: 'yt', icon: '' }, 'home-display');
  assert.equal(h.sourcesCalled, 1);
});

test('All Apps and Home use the same grid and preserve launch callbacks', () => {
  const home = read('js/home-screen.js');
  assert.match(home, /homeCardMode === 'rectangle'/);
  assert.match(home, /COLS = userCols === 3 \|\| userCols === 4 \|\| userCols === 5/);
  assert.match(home, /tile = A\.tiles\.app\(app, 'home-display'/);
  assert.match(home, /tile\.onclick = A\.apps\.playFireplace/);
  assert.match(home, /app-grid cards-/);
});

test('Square and rectangle controls are reachable by D-pad and save settings', () => {
  const html = read('index.html'), settings = read('js/settings-ui.js');
  assert.match(html, /id="home-card-modes"/);
  assert.match(html, /id="home-card-columns"/);
  assert.match(settings, /home-cards:/);
  assert.match(settings, /home-columns:/);
  assert.match(settings, /S\.homeCardMode = item\[0\]/);
  assert.match(settings, /S\.homeCardColumns = value/);
  assert.match(settings, /changed\(A\.homeScreen\.render\)/);
  assert.match(settings, /\[kids\('home-card-modes'\)\]/);
  assert.match(settings, /\[kids\('home-card-columns'\)\]/);
});

test('Rectangle geometry matches reference at 3, 4 and 5 columns', () => {
  const css = read('css/card-modes.css'), html = read('index.html');
  assert.match(css, /cols-3 \.tile \{ width: 576px; height: 300px;/);
  assert.match(css, /cols-4 \.tile \{ width: 424px; height: 221px;/);
  assert.match(css, /cols-5 \.tile \{ width: 332\.8px; height: 173px;/);
  assert.match(css, /\.app-grid\.cards-rectangle \.tile\.focused/);
  assert.match(html, /href="css\/card-modes\.css"/);
});

test('Selected shape and columns persist through the official settings storage', () => {
  const storage = {};
  const A = {};
  const window = {
    AeroTizen: A,
    navigator: { language: 'it-IT', languages: ['it-IT'] }
  };
  vm.runInNewContext(read('js/config.js'), { window, AeroTizen: A });
  A.clock = { defaultTimeFormat: () => '24' };
  const localStorage = {
    getItem: key => storage[key] || null,
    setItem: (key, value) => { storage[key] = value; }
  };
  vm.runInNewContext(read('js/settings.js'), { window, localStorage });
  A.settings.load();
  assert.equal(A.settings.homeCardMode, 'square');
  A.settings.homeCardMode = 'rectangle';
  A.settings.homeCardColumns = 4;
  A.settings.save();
  A.settings.homeCardMode = 'square';
  A.settings.homeCardColumns = null;
  A.settings.load();
  assert.equal(A.settings.homeCardMode, 'rectangle');
  assert.equal(A.settings.homeCardColumns, 4);
});


test('all nine original PNGs are used only for their matching Rectangle app', () => {
  const mapping = [
    ['Netflix','netflix-custom.png'],
    ['Disney+','disney-plus-official.png'],
    ['Xbox','xbox-official.png'],
    ['Amazon Luna','luna-official.png'],
    ['Amazon Alexa','alexa-official.png'],
    ['NOW','now-official.png'],
    ['Rakuten TV','rakuten-tv-official.png'],
    ['QVC+','qvc-plus-official.png'],
    ['RaiPlay','raiplay-official.png']
  ];
  const h = brandHarness('rectangle');
  mapping.forEach(([name,expected]) => {
    assert.ok(fs.existsSync(path.join(__dirname,'../launcher/assets/brands',expected)),
      'missing original asset: ' + expected);
    const tile = h.A.tiles.app({ id:name, name, icon:'native-square.png' },'home-display');
    assert.ok(tile.classList.contains('brand-original-banner'),name);
    if (name === 'RaiPlay') { assert.ok(tile.classList.contains('brand-raiplay')); }
    assert.equal(tile.children[1].src,'assets/brands/' + expected,name);
    assert.equal(tile.children[0].hidden,undefined,'fallback stays present until PNG loads');
    tile.children[1].onload();
    assert.equal(tile.children[0].hidden,true);
  });
});

test('missing custom PNG restores readable fallback and never blocks launch', () => {
  const h = brandHarness('rectangle');
  let open=0;
  const tile=h.A.tiles.app({ id:'netflix', name:'Netflix', icon:'' },'home-display',()=>open++);
  const img=tile.children[1];
  img.onload();
  assert.equal(tile.children[0].hidden,true);
  img.onerror();
  assert.equal(tile.children[0].hidden,false);
  tile.onclick();
  assert.equal(open,1);
});

test('layout Settings render in English without the optional localization module', () => {
  const settings = read('js/settings-ui.js');
  const start = settings.indexOf('  function renderHomeCardModes() {');
  const end = settings.indexOf('\n\n  function renderInputVisibility()', start);
  assert.ok(start >= 0 && end > start);
  const panels = {};
  for (const id of ['home-card-modes', 'home-card-columns']) {
    panels[id] = {
      children: [], attributes: {},
      appendChild(child) { this.children.push(child); },
      setAttribute(key, value) { this.attributes[key] = value; }
    };
  }
  const A = { $: id => panels[id], homeScreen: { render() {} } };
  const S = { homeCardMode: 'rectangle', homeCardColumns: 4, cardSize: 'big' };
  const cfg = { CARD_COLUMNS: { big: 3, small: 5 } };
  const pill = (key, label, selected, onSelect) => ({ key, label, selected, onSelect });
  const render = vm.runInNewContext('(' + settings.slice(start, end).trim() + ')',
    { A, S, cfg, pill, changed: after => { if (after) { after(); } } });
  render();
  assert.deepEqual(panels['home-card-modes'].children.map(p => p.label), ['Square', 'Rectangle']);
  assert.deepEqual(panels['home-card-columns'].children.map(p => p.label),
    ['3 per row', '4 per row', '5 per row']);
  assert.equal(panels['home-card-modes'].attributes['aria-label'], 'Home tile layout');
  assert.equal(panels['home-card-columns'].attributes['aria-label'], 'Apps per row');
  panels['home-card-modes'].children[0].onSelect();
  panels['home-card-columns'].children[2].onSelect();
  assert.equal(S.homeCardMode, 'square');
  assert.equal(S.homeCardColumns, 5);
});

test('layout Settings use translated labels and headings when PR #27 is present', () => {
  const source = read('js/settings-ui.js');
  const start = source.indexOf('  function renderHomeCardModes() {');
  const end = source.indexOf('\n\n  function renderInputVisibility()', start);
  const dict = {
    'Square': 'Quadrato', 'Rectangle': 'Rettangolo',
    '3 per row': '3 per riga', '4 per row': '4 per riga', '5 per row': '5 per riga',
    'Home tile layout': 'Layout tessere Home', 'Apps per row': 'App per riga'
  };
  const panels = {};
  for (const id of ['home-card-modes', 'home-card-columns']) {
    panels[id] = {
      children: [], attributes: {},
      appendChild(child) { this.children.push(child); },
      setAttribute(key, value) { this.attributes[key] = value; }
    };
  }
  const A = {
    $: id => panels[id],
    i18n: { label: (key, english) => dict[english] || english },
    homeScreen: { render() {} }
  };
  const S = { homeCardMode: 'square', homeCardColumns: 3, cardSize: 'big' };
  const cfg = { CARD_COLUMNS: { big: 3, small: 5 } };
  const pill = (key, label, selected, onSelect) => ({ key, label, selected, onSelect });
  const render = vm.runInNewContext('(' + source.slice(start, end).trim() + ')',
    { A, S, cfg, pill, changed: after => { if (after) { after(); } } });
  render();
  assert.deepEqual(panels['home-card-modes'].children.map(p => p.label), ['Quadrato', 'Rettangolo']);
  assert.deepEqual(panels['home-card-columns'].children.map(p => p.label),
    ['3 per riga', '4 per riga', '5 per riga']);
  assert.equal(panels['home-card-modes'].attributes['aria-label'], 'Layout tessere Home');
  assert.equal(panels['home-card-columns'].attributes['aria-label'], 'App per riga');
  const html = read('index.html');
  assert.match(html, /data-i18n="Home tile layout"/);
  assert.match(html, /data-i18n="Apps per row"/);
});


function samsungArtworkHarness(paths) {
  const images = [];
  let sourceCalls = 0;
  const A = {
    settings: { homeCardMode: 'square' },
    catalog: {
      brand: () => ({ background: '#222', logo: null,
        label: 'YouTube', textColour: '#fff' })
    },
    artwork: { sources() { sourceCalls++; return paths.slice(); } },
    el: mockElement
  };
  const ctx = {
    window: { AeroTizen: A, LOGOS: {} },
    document: { createElement: tag => mockElement(tag) },
    Image: function () {
      const img = mockElement('img');
      images.push(img);
      return img;
    },
    setTimeout: () => 1,
    clearTimeout() {}
  };
  vm.runInNewContext(read('js/brands.js'), ctx);
  return { A, images, get sourceCalls() { return sourceCalls; } };
}

test('Samsung Square artwork lookups are shared across simultaneous Home and All Apps tiles', () => {
  const h = samsungArtworkHarness(['/cache/samsung.png']);
  const app = { id: 'youtube', name: 'YouTube', icon: '' };
  const home = h.A.tiles.app(app, 'home-display');
  const all = h.A.tiles.app(app, 'home-display');
  assert.equal(h.images.length, 1, 'only one native cache probe in progress');
  h.images[0].onload();
  assert.equal(h.images.length, 3, 'both cards independently load the confirmed image');
  h.images[1].onload();
  h.images[2].onload();
  assert.ok(home.classList.contains('has-artwork'));
  assert.ok(all.classList.contains('has-artwork'));
  assert.equal(home.children[0].hidden, true);
  assert.equal(all.children[0].hidden, true);
  const repeated = h.A.tiles.app(app, 'home-display');
  assert.equal(h.images.length, 4, 'positive cache avoids another discovery probe');
  h.images[3].onload();
  assert.ok(repeated.classList.contains('has-artwork'));
  assert.equal(h.sourceCalls, 3, 'the upstream path resolver is unchanged');
});

test('missing Samsung square artwork caches failures but preserves readable fallbacks', () => {
  const h = samsungArtworkHarness(['/missing/one.png', '/missing/two.png']);
  const app = { id: 'youtube', name: 'YouTube', icon: '' };
  const first = h.A.tiles.app(app, 'home-display');
  const second = h.A.tiles.app(app, 'home-display');
  assert.equal(h.images.length, 1);
  h.images[0].onerror();
  assert.equal(h.images.length, 2, 'second candidate gets a chance');
  h.images[1].onerror();
  assert.equal(h.images.length, 2);
  assert.equal(first.children[0].hidden, undefined);
  assert.equal(second.children[0].hidden, undefined);
  h.A.tiles.app(app, 'home-display');
  assert.equal(h.images.length, 2, 'negative results prevent duplicate failed probes');
});
