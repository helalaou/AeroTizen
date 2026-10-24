const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../launcher/js/wallpaper-categories.js'), 'utf8');
function setup(photo = true) {
  function element(tag = 'div', cls, text) {
    const classes = new Set();
    return { tagName: tag.toUpperCase(), textContent: text, style: {}, dataset: {}, children: [],
      classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
      setAttribute(k, v) { this[k] = v; },
      appendChild(el) { this.children.push(el); el.parentNode = this; },
      insertBefore(el) { this.children.unshift(el); el.parentNode = this; }
    };
  }
  const pane = element(), ids = {};
  for (const id of ['bg-anim', 'bg-still', 'speed-row'].concat(photo ? ['weather-photo-choice'] : [])) {
    const box = ids[id] = element(); box.previousElementSibling = element('h3'); pane.appendChild(box);
  }
  for (const key of ['bg:black', 'bg:graphite']) { const el = element(); el.dataset.key = key; ids['bg-still'].appendChild(el); }
  let focused = 0;
  const A = { $: id => ids[id], el: element, settings: { background: 'graphite', weatherPhoto: photo },
    glassUI: { isActive: () => true }, settingsUi: { focus() { focused++; } } };
  vm.runInNewContext(source, { window: { AeroTizen: A, Backgrounds: { list: [] } } });
  A.wallpapers.refresh();
  return { A, pane, ids, tabs: pane.children[0], get focused() { return focused; } };
}
test('wallpaper categories reuse controls, filter solids/gradients, and never mutate settings', () => {
  const h = setup(), settings = JSON.stringify(h.A.settings), still = h.ids['bg-still'];
  assert.equal(h.tabs.children.length, 4);
  for (const tab of h.tabs.children) { tab.onclick(); assert.equal(JSON.stringify(h.A.settings), settings); }
  h.tabs.children.find(el => el.dataset.category === 'solid').onclick();
  assert.equal(still.children[0].hidden, false); assert.equal(still.children[1].hidden, true);
  h.tabs.children.find(el => el.dataset.category === 'gradient').onclick();
  assert.equal(still.children[0].hidden, true); assert.equal(still.children[1].hidden, false);
  h.A.wallpapers.refresh(); assert.equal(h.pane.children[0], h.tabs);
});
test('Glass settings work without the independent photo-weather contribution', () => {
  const h = setup(false);
  assert.equal(h.tabs.children.length, 3);
  assert.equal(h.ids['bg-still'].hidden, false);
  assert.equal(h.ids['bg-anim'].hidden, true);
});
