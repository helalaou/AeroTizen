const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}
function makeElement(tag = 'div', className = '', id = '') {
  const classes = new Set(className.split(' ').filter(Boolean));
  const attrs = {};
  const el = {
    tagName: tag.toUpperCase(), id, dataset: {}, children: [],
    parentNode: null, hidden: false, style: {}, textContent: '',
    offsetLeft: 7, offsetTop: 10, offsetWidth: 200, offsetHeight: 65,
    scrollTop: 0, scrollLeft: 0, scrollHeight: 900, clientHeight: 800,
    get className() { return Array.from(classes).join(' '); },
    set className(value) {
      classes.clear();
      String(value).split(' ').filter(Boolean).forEach(name => classes.add(name));
    },
    classList: {
      add: name => classes.add(name),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle(name, on) {
        if (on === undefined) { if (classes.has(name)) classes.delete(name); else classes.add(name); }
        else if (on) classes.add(name); else classes.delete(name);
      },
      contains: name => classes.has(name)
    },
    get offsetParent() { return this.hidden ? null : (this.parentNode || {}); },
    appendChild(child) {
      if (child.parentNode && child.parentNode.children) {
        const old = child.parentNode.children.indexOf(child);
        if (old >= 0) child.parentNode.children.splice(old, 1);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name] || null; },
    addEventListener() {},
    getBoundingClientRect() { const top = this.rectTop || 150; return { top, bottom: top + 64, left: 400, right: 600, width: 200, height: 64 }; },
    contains(child) {
      for (let p = child; p; p = p.parentNode) if (p === this) return true;
      return false;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-key]');
      const out = [];
      function visit(parent) {
        parent.children.forEach(child => {
          if (child.dataset && child.dataset.key) out.push(child);
          visit(child);
        });
      }
      visit(this); return out;
    }
  };
  return el;
}
function harness(options = {}) {
  const editor = makeElement('div', 'sheet', 'editor');
  const heading = makeElement('h2');
  heading.textContent = 'Settings';
  editor.appendChild(heading);
  const ids = {};
  function group(name, id, key) {
    const header = makeElement('h3'); header.textContent = name; editor.appendChild(header);
    const parent = makeElement('div', 'units', id); editor.appendChild(parent);
    const choice = makeElement('div', 'pill unit');
    choice.dataset.key = key;
    choice.rectTop = 150 + Object.keys(ids).length * 120;
    choice.onclick = () => { choice.clicked = true; };
    parent.appendChild(choice);
    ids[id] = { parent, choice };
  }
  group('Animated backgrounds', 'bg-anim', 'bg:aurora');
  group('Date & time', 'time-formats', 'time:24');
  group('Network indicator', 'network-visibility', 'network:true');
  group('Show in app menu', 'all-apps', 'app:test');
  group('HDMI ports', 'input-visibility', 'input:all');
  if (options.hdmiOverride) {
    group('HDMI always visible', 'hdmi-force-visibility', 'hdmi-keep:1');
  }
  const escape = makeElement('div', '', 'escape');
  escape.dataset.key = 'escape'; escape.rectTop = 920; editor.appendChild(escape);
  const document = { createElement: tag => makeElement(tag), body: makeElement('body') };
  const A = { $: id => id === 'editor' ? editor : null, settingsUi: {
    isOpen: () => true, close() {}, focus() {}
  }, i18n: null };
  vm.runInNewContext(read('launcher/js/glass-ui.js'), {
    window: { AeroTizen: A, getComputedStyle: () => ({ borderRadius: '17px' }) },
    document
  });
  A.glassUI.create();
  return { A, editor, ids, escape };
}
test('the original settings controls and callbacks are moved rather than cloned', () => {
  const h = harness();
  assert.equal(h.editor.classList.contains('aero-settings-ready'), true);
  assert.equal(h.A.glassUI.navCount(), 5);
  for (const item of Object.values(h.ids)) {
    assert.ok(item.parent.contains(item.choice));
    assert.equal(typeof item.choice.onclick, 'function');
    item.choice.onclick();
    assert.equal(item.choice.clicked, true);
  }
});
test('category activation shows only the corresponding controls', () => {
  const h = harness();
  h.A.glassUI.activate('status');
  assert.equal(h.A.glassUI.activeId(), 'status');
  const rows = h.A.glassUI.rows();
  assert.equal(rows.length, 6);
  assert.equal(rows[5][0], h.ids['time-formats'].choice);
  h.A.glassUI.activate('sources');
  assert.equal(h.A.glassUI.rows()[5][0], h.ids['input-visibility'].choice);
  h.A.glassUI.activate('apps');
  assert.equal(h.A.glassUI.rows().length, 7);
  assert.ok(h.escape.parentNode);
});
test('focused controls use a single moving outline matching their radius', () => {
  const h = harness();
  h.A.glassUI.activate('status');
  const item = h.ids['time-formats'].choice;
  h.A.glassUI.updateHighlight(item);
  function findPlate(node) {
    if (node.classList.contains('aero-content-glider')) return node;
    for (const child of node.children) {
      const found = findPlate(child);
      if (found) return found;
    }
    return null;
  }
  const plate = findPlate(h.editor);
  assert.ok(plate, 'the moving outline should be mounted in Settings');
  assert.equal(plate.style.borderRadius, '17px');
  assert.equal(plate.classList.contains('is-visible'), true);
});
test('the header shortcut reuses the existing Samsung Home exit method', () => {
  const home = read('launcher/js/home-screen.js');
  const index = read('launcher/index.html');
  assert.match(home, /if \(A\.homewatch\.openSamsungHome\)/);
  assert.match(home, /A\.homewatch\.openSamsungHome\(\)/);
  assert.match(home, /A\.homewatch\.useSamsungHome\(\)/);
  assert.match(index, /id="samsung-home-shortcut"/);
  assert.match(home, /rows\s*=\s*\[\[A\.\$\('gear'\),\s*A\.\$\('samsung-home-shortcut'\)/);
});
test('glass assets load after the upstream settings module and preserve non-glass defaults', () => {
  const html = read('launcher/index.html');
  const js = html.indexOf('src="js/glass-ui.js"');
  assert.ok(js > html.indexOf('src="js/settings-ui.js"'));
  assert.ok(js < html.indexOf('src="js/main.js"'));
  const css = read('launcher/css/glass-layout.css');
  assert.doesNotMatch(css, /(?:^|\s)(?:-webkit-)?backdrop-filter\s*:/m);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.aero-content-glider/);
});
test('manual HDMI exceptions from PR #29 stay inside the Sources Settings category', () => {
  const h = harness({ hdmiOverride: true });
  h.A.glassUI.activate('sources');
  const visible = h.A.glassUI.rows().flat();
  assert.ok(visible.includes(h.ids['input-visibility'].choice));
  assert.ok(visible.includes(h.ids['hdmi-force-visibility'].choice));
  assert.equal(h.A.glassUI.activeId(), 'sources');
});
