const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/load_typescript.cjs');
const { createNavigation } = loadTypeScript('launcher/src/shared/navigation/createNavigation.ts');

const element = (top, left) => ({ offsetParent: {}, offsetTop: top, offsetLeft: left });

test('navigation publishes a focus key and follows registered visual rows without writing DOM', () => {
  const a = element(0, 0), b = element(0, 100), c = element(100, 0), d = element(200, 0);
  let reads = 0;
  Object.defineProperty(a, 'offsetTop', { get() { reads++; return 0; } });
  const scrolled = [], states = [];
  const nav = createNavigation(node => scrolled.push(node));
  // Registration order differs from visual order (for example async results).
  for (const [key, node] of [['d', d], ['b', b], ['a', a], ['c', c]]) nav.register(key, node);
  const unsubscribe = nav.subscribe(() => states.push(nav.getSnapshot()));
  nav.reset('b'); assert.equal(nav.focus(), b);
  assert.equal(nav.getSnapshot(), 'b');
  nav.move('down'); assert.equal(nav.current(), c);
  nav.move('down'); nav.move('down'); assert.equal(nav.current(), d);
  nav.move('right'); nav.move('left'); assert.equal(nav.current(), d);
  assert.equal(reads, 1, 'arrows use cached geometry');
  assert.deepEqual(states, ['b', 'c', 'd'], 'unchanged focus does not publish');
  d.offsetTop = -100; nav.invalidate();
  assert.equal(nav.focus(), d, 'selection survives a row change');
  nav.select('b'); nav.focus(); assert.equal(nav.current(), b);
  b.offsetParent = null; nav.invalidate();
  assert.equal(nav.focus(), a, 'hidden controls leave navigation');
  nav.clear(); assert.equal(nav.getSnapshot(), undefined);
  for (const key of ['a', 'b', 'c', 'd']) nav.register(key, null);
  assert.equal(nav.focus(), undefined);
  nav.move('up'); nav.move('down'); assert.equal(nav.current(), undefined);
  assert.ok(scrolled.length > 0);
  unsubscribe();
});
