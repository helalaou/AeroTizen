const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const launcher = path.join(__dirname, '../launcher');
const script = name => fs.readFileSync(path.join(launcher, 'js', name), 'utf8');

function runtime(entries) {
  const A = {}, context = vm.createContext({ window: { AeroTizen: A } });
  vm.runInContext(script('app-catalog.js'), context);
  if (entries) A.catalog.apps = entries;
  vm.runInContext(script('app-lookup.js'), context);
  vm.runInContext(script('logos.js'), context);
  return { A, logos: context.window.LOGOS };
}

test('catalogue records have unique keys and unambiguous string IDs', () => {
  const { A } = runtime();
  const keys = new Set(), ids = new Set();
  assert.ok(A.catalog.apps.length > 0);
  for (const entry of A.catalog.apps) {
    assert.match(entry.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!keys.has(entry.key), `Duplicate app key: ${entry.key}`);
    keys.add(entry.key);
    assert.equal(typeof entry.name, 'string');
    assert.ok(entry.name.trim());
    assert.ok(Array.isArray(entry.variants));
    for (const variant of entry.variants) {
      assert.ok(variant.appId || variant.storeId, `Missing identity: ${entry.key}`);
      for (const field of ['appId', 'storeId']) {
        if (variant[field] === undefined) continue;
        const id = variant[field];
        assert.equal(typeof id, 'string', `${entry.key}.${field} must be a string`);
        assert.match(id, field === 'storeId' ? /^\d+$/ : /^[A-Za-z0-9_.-]+$/);
        assert.ok(!ids.has(id), `Duplicate app/store ID: ${id}`);
        ids.add(id);
      }
      if (variant.preloaded !== undefined) {
        assert.equal(typeof variant.preloaded, 'boolean');
        assert.ok(variant.appId && variant.storeId, `Preloaded app needs both IDs: ${entry.key}`);
      }
    }
  }
});

test('catalogue fallback logos exist and legacy rules are explicit', () => {
  const { A, logos } = runtime();
  for (const entry of A.catalog.apps) {
    if (entry.fallback) {
      assert.equal(typeof entry.fallback.background, 'string');
      assert.ok(entry.fallback.background);
      assert.ok(entry.fallback.label === null || typeof entry.fallback.label === 'string');
      if (entry.fallback.logo !== null) {
        const { slug, version } = entry.fallback.logo;
        assert.match(slug, /^[a-z0-9][a-z0-9-]*$/);
        assert.match(version, /^\d+\.\d+\.\d+$/);
        assert.ok(Object.hasOwn(logos, slug), `Missing logo: ${entry.key}/${slug}`);
        assert.equal(typeof entry.fallback.logoColour, 'string');
      }
    }
    for (const field of ['artworkNames', 'brandPrefixes']) {
      const aliases = entry.legacy && entry.legacy[field];
      if (!aliases) continue;
      assert.ok(Array.isArray(aliases));
      for (const alias of aliases) {
        assert.equal(typeof alias, 'string');
        assert.ok(alias && alias === alias.toLowerCase());
      }
      if (field === 'brandPrefixes') assert.ok(entry.fallback, `Brand rule needs fallback styling: ${entry.key}`);
      if (field === 'artworkNames') assert.ok(entry.variants.some(v => v.storeId), `Artwork rule needs store ID: ${entry.key}`);
    }
  }
});

test('verified app and store IDs select the same record despite renamed or conflicting names', () => {
  const { A } = runtime();
  for (const id of ['IkWsFHtOY9.Stremio', '3202306031311']) {
    const app = { id, name: 'YouTube' };
    assert.equal(A.catalog.artworkStoreId(app), '3202306031311');
    assert.equal(A.catalog.brand(app).logo.slug, 'stremio');
  }
  assert.equal(A.catalog.brand({ id: 'DqEoaplKlw.bbchybrid', name: 'YouTube' }), null);
  assert.equal(A.catalog.artworkStoreId({ id: 'DqEoaplKlw.bbchybrid', name: 'Renamed app' }), '3201601007670');
});

test('legacy prefix branding does not enable artwork for an unrelated app name', () => {
  const { A } = runtime();
  const app = { id: 'unknown.app', name: 'YouTube TV' };
  assert.equal(A.catalog.brand(app).logo.slug, 'youtube');
  assert.equal(A.catalog.artworkStoreId(app), null);
  assert.equal(A.catalog.artworkStoreId({ id: 'unknown.app', name: 'Amazon Prime Video' }), '3201910019365');
  assert.equal(A.catalog.brand({ id: 'unknown.app', name: 'Amazon Prime Video' }), null);
  assert.equal(A.catalog.artworkStoreId({ id: 'unknown.app', name: ' ITVX - fresh, free streaming.' }), '121299000089');
});

test('each app variant retains its paired store ID', () => {
  const { A } = runtime([{
    key: 'example', name: 'Example',
    variants: [{ appId: 'example.first', storeId: '123' }, { appId: 'example.second', storeId: '456' }]
  }]);
  assert.equal(A.catalog.artworkStoreId({ id: 'example.first' }), '123');
  assert.equal(A.catalog.artworkStoreId({ id: 'example.second' }), '456');
  assert.equal(A.catalog.artworkStoreId({ id: '456' }), '456');
});

test('unknown IDs remain unknown and preloaded mappings do not use name aliases', () => {
  const { A } = runtime();
  for (const id of ['unknown.app', 'constructor', '__proto__']) {
    assert.equal(A.catalog.brand({ id, name: 'Unknown' }), null);
    assert.equal(A.catalog.artworkStoreId({ id, name: 'Unknown' }), null);
    assert.equal(A.catalog.preloadedStoreId(id), null);
  }
  assert.equal(A.catalog.preloadedStoreId('org.tizen.netflix-app'), '3201907018807');
  assert.equal(A.catalog.preloadedStoreId('org.tizen.primevideo'), '3201910019365');
  assert.equal(A.catalog.preloadedStoreId('netflix'), null);
  assert.equal(A.catalog.preloadedStoreId('9Ur5IzDKqV.TizenYouTube'), null);
});

test('watcher requests keep the preloaded store IDs from the shared catalogue', () => {
  const requests = [], A = { tizen: {} };
  class Request {
    open(method, url) { requests.push({ method, url }); }
    send() {}
  }
  const context = vm.createContext({
    window: { AeroTizen: A }, AeroTizen: A, XMLHttpRequest: Request,
    document: { addEventListener() {} }
  });
  for (const name of ['config.js', 'app-catalog.js', 'app-lookup.js', 'homewatch.js']) {
    vm.runInContext(script(name), context);
  }
  A.homewatch.watch('org.tizen.netflix-app');
  A.homewatch.watch('org.tizen.primevideo');
  A.homewatch.watch('normal.app');
  assert.deepEqual(requests, [
    { method: 'GET', url: 'http://127.0.0.1:47790/watch?id=3201907018807' },
    { method: 'GET', url: 'http://127.0.0.1:47790/watch?id=3201910019365' },
    { method: 'GET', url: 'http://127.0.0.1:47790/watch?id=normal.app' }
  ]);
});
