const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../launcher');

function runtime(tv = false) {
  const images = [], timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor() {
      this.children = []; this.style = {}; this.attributes = {}; this.className = '';
      this.hidden = false;
      this.classList = {
        add: (name) => { this.className += ' ' + name; },
        contains: (name) => this.className.split(/\s+/).includes(name)
      };
    }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  class Image extends Element { constructor() { super(); images.push(this); } }
  const A = {
    tizen: tv ? {} : null,
    el: (tag, className, text) => Object.assign(new Element(), { className: className || '', textContent: text })
  };
  const context = vm.createContext({
    window: { AeroTizen: A, LOGOS: { netflix: 'M0 0', youtube: 'M0 0' } }, AeroTizen: A, Image,
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id) => timers.delete(id)
  });
  for (const file of ['config.js', 'app-catalog.js', 'app-lookup.js', 'artwork.js', 'brands.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
  }
  return { A, images, timers };
}

test('browser previews keep the previous icons without requesting artwork', () => {
  const { A } = runtime();
  assert.deepEqual(Array.from(A.artwork.sources({ id: 'demo', name: 'ITVX - fresh, free streaming.' })), []);
  assert.deepEqual(Array.from(A.artwork.sources({ id: '111299001912', name: 'YouTube', icon: '/opt/share/webappservice/apps_icon/all/111299001912/304x304.png' })), []);
});

test('TV artwork matches stable app IDs even when a display name changes', () => {
  const { A } = runtime(true);
  const sources = Array.from(A.artwork.sources({ id: 'DqEoaplKlw.bbchybrid', name: 'Renamed app' }));
  assert.deepEqual(sources, [
    '/opt/share/webappservice/apps_icon/all/3201601007670/304x304.png',
    '/opt/share/webappservice/apps_icon/FirstScreen/3201601007670/250x250.png'
  ]);
  assert.equal(A.artwork.sources({ id: 'IkWsFHtOY9.Stremio', name: 'YouTube' })[0], '/opt/share/webappservice/apps_icon/all/3202306031311/304x304.png');
  assert.deepEqual(Array.from(A.artwork.sources({ id: '../../unrelated', name: 'Unknown' })), []);
  assert.deepEqual(Array.from(A.artwork.sources({ id: 'other', name: 'UFO' })), []);
  assert.deepEqual(Array.from(A.artwork.sources({ id: 'other', name: 'YouTube TV' })), []);
});

test('uncatalogued apps use TV-provided store IDs and only local Samsung files', () => {
  const { A } = runtime(true);
  assert.deepEqual(Array.from(A.artwork.sources({ id: 'unknown.app', storeId: '123456', name: 'Unknown app' })), [
    '/opt/share/webappservice/apps_icon/all/123456/304x304.png',
    '/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png'
  ]);
  assert.deepEqual(Array.from(A.artwork.sources({ id: 'unknown.app', storeId: '../../bad', name: 'Unknown app' })), []);
});

test('a TV-provided store ID takes precedence over model-specific catalogue IDs', () => {
  const { A } = runtime(true);
  const fromCache = A.artwork.sources({ id: 'native', name: 'Samsung TV Plus', icon: '/opt/share/webappservice/apps_icon/FirstScreen/123456/250x250.png' });
  assert.equal(fromCache[0], '/opt/share/webappservice/apps_icon/all/123456/304x304.png');
  assert.equal(fromCache.length, 2);
  assert.equal(A.artwork.sources({ id: '789012', name: 'Samsung TV Plus' })[0], '/opt/share/webappservice/apps_icon/all/789012/304x304.png');
  assert.equal(A.artwork.sources({ id: 'native', name: 'Samsung TV Plus', storeId: '987654' })[0], '/opt/share/webappservice/apps_icon/all/987654/304x304.png');
});

test('Samsung artwork fills the card without losing selection or click handling', () => {
  const { A, images, timers } = runtime(true);
  let clicks = 0;
  const tile = A.tiles.app({ id: 'app', name: 'YouTube' }, 'on', () => { clicks++; });
  const fallback = tile.children[0];
  const arrow = A.el('div', 'move-arrow');
  tile.appendChild(arrow);
  images[0].onerror();
  assert.equal(images[1].src, '/opt/share/webappservice/apps_icon/FirstScreen/111299001912/250x250.png');
  images[1].onload();
  assert.equal(fallback.hidden, true);
  assert.ok(tile.classList.contains('has-artwork'));
  assert.ok(tile.classList.contains('on'));
  assert.ok(tile.children.includes(arrow));
  assert.equal(tile.attributes['aria-label'], 'YouTube');
  tile.onclick(); assert.equal(clicks, 1);
  assert.equal(timers.size, 0);
});

test('failed or stalled Samsung artwork leaves the previous brand fallback visible', () => {
  const { A, images, timers } = runtime(true);
  const tile = A.tiles.app({ id: 'unknown', name: 'YouTube' }, 'focused');
  const timeout = timers.values().next().value;
  timeout();
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
  images[1].onerror();
  const fallback = tile.children[0];
  assert.equal(fallback.hidden, false);
  assert.ok(fallback.innerHTML.includes('<svg'));
  assert.equal(fallback.children[0].textContent, 'YouTube');
  assert.equal(images.length, 2);
  assert.equal(tile.classList.contains('has-artwork'), false);
  assert.ok(tile.classList.contains('focused'));
  assert.equal(timers.size, 0);
});

test('unknown apps retain their original icon and readable label if all images fail', () => {
  const { A, images, timers } = runtime(true);
  const tile = A.tiles.app({ id: 'unknown', name: 'Unknown app', icon: '/opt/usr/apps/unknown/icon.png', storeId: '123456' });
  const fallback = tile.children[0];
  assert.equal(images[0].src, '/opt/usr/apps/unknown/icon.png');
  images[1].onerror(); images[2].onerror();
  assert.equal(fallback.hidden, false);
  assert.ok(fallback.children.includes(images[0]));
  assert.equal(fallback.children[1].textContent, 'Unknown app');
  assert.equal(timers.size, 0);
  images[0].onerror();
  assert.equal(fallback.children.length, 1);
  assert.equal(fallback.children[0].textContent, 'Unknown app');
});
