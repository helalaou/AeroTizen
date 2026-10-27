const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../launcher/js/home-screen.js'), 'utf8');

class Element {
  constructor(tag = 'div', className = '') {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.hidden = false;
    this._text = '';
    this.classList = {
      add: name => this._setClass(name, true),
      remove: name => this._setClass(name, false),
      toggle: (name, enabled) => {
        this._setClass(name, enabled === undefined ? !this.classList.contains(name) : enabled);
      },
      contains: name => this.className.split(/\s+/).includes(name)
    };
  }
  _setClass(name, enabled) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    if (enabled) { classes.add(name); } else { classes.delete(name); }
    this.className = [...classes].join(' ');
  }
  set textContent(text) {
    this._text = String(text);
    for (const child of this.children) { child.parentNode = null; }
    this.children = [];
  }
  get textContent() { return this._text; }
  get firstChild() { return this.children[0] || null; }
  get offsetTop() { return 0; }
  get offsetWidth() { return 332; }
  get offsetHeight() { return 332; }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      while (child.firstChild) { this.appendChild(child.firstChild); }
      return child;
    }
    if (child.parentNode) { child.parentNode.removeChild(child); }
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index < 0) { throw Error('Not a child'); }
    this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(child, next) {
    if (child.parentNode) { child.parentNode.removeChild(child); }
    const index = next ? this.children.indexOf(next) : -1;
    if (index < 0) { return this.appendChild(child); }
    this.children.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  getBoundingClientRect() {
    return { left: 100, right: 432, top: 300, bottom: 632, width: 332, height: 332 };
  }
  querySelectorAll(selector) {
    const matches = [];
    const selectors = selector.split(',').map(s => s.trim());
    function descend(root) {
      for (const child of root.children) {
        const names = child.className.split(/\s+/);
        if (selectors.some(s => s.split('.').slice(1).every(name => names.includes(name)))) {
          matches.push(child);
        }
        descend(child);
      }
    }
    descend(this);
    return matches;
  }
}

function fixture(initial = ['a', 'b'], withInput = true) {
  const timers = new Map();
  let serial = 0, saves = 0, launched = 0, openedSettings = 0;
  const body = new Element('body');
  const header = body.appendChild(new Element('header'));
  const gear = header.appendChild(new Element('div'));
  const homeTab = header.appendChild(new Element('button'));
  const appsTab = header.appendChild(new Element('button'));
  const viewport = body.appendChild(new Element('div'));
  const rows = viewport.appendChild(new Element('main'));
  const grid = rows.appendChild(new Element('div'));
  const inputsSection = rows.appendChild(new Element('section'));
  const inputs = inputsSection.appendChild(new Element('div'));
  if (withInput) { inputs.appendChild(new Element('div', 'tile')); }
  const empty = rows.appendChild(new Element('p'));
  const nodes = { gear, 'home-tab': homeTab, 'apps-tab': appsTab,
    rows, grid, inputs, 'inputs-section': inputsSection, 'apps-empty': empty };
  const apps = ['a', 'b', 'c'].map(id => ({ id, name: 'App ' + id }));
  const settings = { home: initial.slice(), cardSize: 'big',
    save() { saves++; this.persisted = this.home.slice(); } };
  const A = {
    config: { CARD_COLUMNS: { big: 3, small: 5 }, FIREPLACE_ID: '__fire',
      LONG_PRESS_MS: 600, KEY: { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
        ENTER: 13, BACK: 10009, ESC: 27 } },
    settings,
    apps: { all: apps, byId: id => apps.find(a => a.id === id) || null },
    $: id => nodes[id],
    el: (tag, cls, txt) => {
      const el = new Element(tag, cls);
      if (txt !== undefined) { el.textContent = txt; }
      return el;
    },
    chunk: (arr, n) => {
      const out = [];
      for (let i = 0; i < arr.length; i += n) { out.push(arr.slice(i, i + n)); }
      return out;
    },
    clearFocus: () => body.querySelectorAll('.focused').forEach(el => el.classList.remove('focused')),
    settingsUi: { isOpen: () => false, open() { openedSettings++; } },
    tiles: {
      ICONS: { flame: '<svg></svg>' },
      app: (app, className, onClick) => {
        const el = new Element('div', 'tile');
        el.onclick = () => { launched++; onClick(); };
        return el;
      }
    },
    toast() {}, hideToast() {}
  };
  // Avoid counting launches twice: the app's launch method is what is tested.
  A.apps.launch = () => {};
  const document = { body, createDocumentFragment: () => new Element('#fragment'), querySelectorAll: selector => body.querySelectorAll(selector) };
  const context = vm.createContext({
    window: { AeroTizen: A, innerWidth: 1920, innerHeight: 1080,
      requestAnimationFrame: fn => fn() },
    document,
    setTimeout(fn, delay) { timers.set(++serial, { fn, delay }); return serial; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(source, context);
  A.homeScreen.render();
  const key = (code, event = 'keydown') => A.homeScreen[event](code, { preventDefault() {} });
  function fireHold() {
    key(13);
    const entry = [...timers].find(([, value]) => value.delay === 600);
    assert.ok(entry, 'long-press timer was started');
    timers.delete(entry[0]);
    entry[1].fn();
    A.homeScreen.keyup(13);
  }
  function menuOptions() {
    return body.querySelectorAll('.tile-actions-option')
      .filter(el => !el.parentNode.classList.contains('is-closing'));
  }
  return {
    A, body, grid, inputs, homeTab, appsTab, settings, key, fireHold, menuOptions,
    get launches() { return launched; },
    get saves() { return saves; },
    get settingsOpens() { return openedSettings; }
  };
}

test('short OK launches an app once; repeats do not create extra launches', () => {
  const h = fixture();
  h.key(13);
  h.key(13);
  assert.equal(h.launches, 0);
  h.A.homeScreen.keyup(13);
  assert.equal(h.launches, 1);
  assert.equal(h.menuOptions().length, 0);
});

test('holding OK only opens Home actions and release does nothing', () => {
  const h = fixture();
  h.fireHold();
  assert.equal(h.launches, 0);
  assert.equal(h.saves, 0);
  assert.deepEqual(h.menuOptions().map(x => x.children[1].textContent),
    ['Move', 'Remove from Home']);
  h.key(13); // fresh physical press chooses Move, but its release does not execute anything else
  h.A.homeScreen.keyup(13);
  h.key(39); // move right
  h.key(13); // drop
  h.A.homeScreen.keyup(13);
  assert.deepEqual(Array.from(h.settings.home), ['b', 'a']);
  assert.equal(h.launches, 0);
});

test('Home removal preserves focus and saves the new favourite order', () => {
  const h = fixture();
  h.fireHold();
  h.key(40); // select Remove from Home
  h.key(13); // confirm
  h.A.homeScreen.keyup(13);
  assert.deepEqual(h.settings.home, ['b']);
  assert.deepEqual(h.settings.persisted, ['b']);
  assert.equal(h.grid.children.length, 1);
  assert.ok(h.grid.children[0].classList.contains('focused'));
  assert.equal(h.launches, 0);
});

test('All apps menu adds and removes favourites without hiding the app', () => {
  const h = fixture(['a']);
  h.appsTab.onclick();
  h.key(40);
  h.fireHold();
  assert.deepEqual(h.menuOptions().map(x => x.children[1].textContent), ['Remove from Home']);
  h.key(13); h.A.homeScreen.keyup(13);
  assert.deepEqual(h.settings.home, []);
  assert.equal(h.grid.children.length, 3);
  h.fireHold();
  assert.deepEqual(h.menuOptions().map(x => x.children[1].textContent), ['Add to Home']);
  h.key(13); h.A.homeScreen.keyup(13);
  assert.deepEqual(h.settings.home, ['a']);
  assert.equal(h.grid.children.length, 3);
  assert.equal(h.launches, 0);
});

test('Back dismisses the menu and the next short OK still launches', () => {
  const h = fixture();
  h.fireHold();
  h.key(10009);
  assert.equal(h.menuOptions().length, 0);
  h.key(13);
  h.A.homeScreen.keyup(13);
  assert.equal(h.launches, 1);
});

test('removing the last tile selects Inputs when available, otherwise Home tab', () => {
  for (const withInput of [true, false]) {
    const h = fixture(['a'], withInput);
    h.fireHold();
    h.key(40);
    h.key(13); h.A.homeScreen.keyup(13);
    assert.deepEqual(h.settings.home, []);
    const expected = withInput ? h.inputs.children[0] : h.homeTab;
    assert.ok(expected.classList.contains('focused'));
  }
});

test('a long press on a navigation tab never opens tile actions', () => {
  const h = fixture();
  h.key(38); // header
  h.fireHold();
  assert.equal(h.menuOptions().length, 0);
  assert.equal(h.launches, 0);
  assert.equal(h.settingsOpens, 0);
});


test('tab switches reuse tile DOM, while a changed favourite list invalidates parked tiles', () => {
  const h = fixture(['a']);
  const original = h.grid.children[0];
  h.appsTab.onclick();
  const all = h.grid.children.slice();
  h.homeTab.onclick();
  assert.equal(h.grid.children[0], original);
  h.appsTab.onclick();
  assert.equal(h.grid.children[0], all[0]);
  h.settings.home = ['b'];
  h.A.homeScreen.render();
  h.homeTab.onclick();
  assert.equal(h.grid.children[0].dataset.id, 'b');
  assert.notEqual(h.grid.children[0], original);
});
