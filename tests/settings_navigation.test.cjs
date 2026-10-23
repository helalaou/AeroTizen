const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./helpers/load_typescript.cjs');
const { createNavigation } = loadTypeScript('launcher/src/shared/navigation/createNavigation.ts');

const element = key => {
  const classes = new Set();
  return { dataset: { key }, classes, classList: { add: key => classes.add(key), remove: key => classes.delete(key) } };
};

test('remote navigation uses cached rows, follows stable keys and clamps across changed layouts', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(element);
  let rows = [[a, b], [c], [d]], measures = 0;
  const nav = createNavigation(() => { measures++; return rows; }, () => {});
  nav.reset('b'); assert.equal(nav.focus(), b);
  nav.move('down'); assert.equal(nav.current(), c);
  nav.move('down'); nav.move('down'); assert.equal(nav.current(), d);
  nav.move('right'); nav.move('left'); assert.equal(nav.current(), d);
  assert.equal(measures, 1, 'arrows do not remeasure layout');
  assert.equal([a,b,c,d].filter(node => node.classes.has('focused')).length, 1);
  rows = [[d, a], [b]]; nav.invalidate(); assert.equal(nav.focus(), d, 'selection survives a row change');
  nav.select('b'); nav.focus(); assert.equal(nav.current(), b);
  rows = [[a]]; nav.invalidate(); assert.equal(nav.focus(), a, 'removed target has a safe fallback');
  nav.clear(); assert.equal(a.classes.size, 0);
  rows = []; nav.invalidate(); assert.equal(nav.focus(), undefined);
  nav.move('up'); nav.move('down'); assert.equal(nav.current(), undefined);
});
