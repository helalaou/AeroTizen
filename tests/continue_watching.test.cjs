const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
const prefix = 'http://samsung.com/tv/metadata/';
const source = { id: 'video.app', name: 'Video', storeId: '123' };
const card = (id, timestamp = 1000, extra = {}) => ({ app_id: '123', content_id: id, content_title: 'Show',
  payload: '{"episode":"' + id + '"}', timestamp, playback: 0, duration: 300, season: 1, episode: 1, ...extra });
function harness() {
  const settingsListeners = [], appListeners = [], clockListeners = [], requests = [], timers = new Map(), events = {}, launches = [], watches = [];
  let timer = 0, reads = 0, now = Date.now(), elapsed = 0;
  const A = { config: { HIDDEN_APPS: /service|companion|dummy/i },
    settings: { continueWatching: false, continueWatchingApps: [], subscribe: fn => settingsListeners.push(fn) },
    apps: { inventory: [{ id: source.id, packageId: 'pkg', name: 'Video' }], ready: true, subscribe: fn => appListeners.push(fn) },
    tiles: { shortName: name => name.replace(/ - .*/, '') },
    catalog: { storeId: id => id === source.id ? source.storeId : null },
    tizen: { application: { getAppMetaData: () => { reads++; return [{ key: prefix + 'app_support_continue_watching', value: 'true' }]; },
      launchAppControl: (control, id, ok, fail) => launches.push({ control: plain(control), id, fail }) },
    ApplicationControl: function (operation, uri, mime, category, data) { Object.assign(this, { operation, data }); },
    ApplicationControlData: function (key, value) { Object.assign(this, { key, value }); } },
    clock: { subscribe: fn => { clockListeners.push(fn); return () => clockListeners.splice(clockListeners.indexOf(fn), 1); } },
    homewatch: { watch: id => watches.push(id) }, toast() {} };
  const document = { hidden: false, addEventListener: (name, fn) => { events[name] = fn; } };
  function XMLHttpRequest() { requests.push(this); }
  XMLHttpRequest.prototype.open = function (method, url) { Object.assign(this, { method, url }); };
  XMLHttpRequest.prototype.setRequestHeader = function (key, value) { this.header = [key, value]; };
  XMLHttpRequest.prototype.send = function () {};
  XMLHttpRequest.prototype.abort = function () { this.aborted = true; this.onabort?.(); };
  vm.runInNewContext(fs.readFileSync('launcher/js/continue-watching.js', 'utf8'), {
    window: { AeroTizen: A, performance: { now: () => elapsed } }, document, XMLHttpRequest, Date: { now: () => now }, setTimeout: (fn, delay) => { timers.set(++timer, { fn, delay }); return timer; },
    clearTimeout: id => timers.delete(id)
  });
  const cw = A.continueWatching;
  return { A, cw, document, events, requests, launches, watches, timers, get reads() { return reads; },
    save: () => settingsListeners.forEach(fn => fn()),
    age: ms => { now += ms; elapsed += ms; },
    setWall: value => { now = value; },
    tick: () => clockListeners.slice().forEach(fn => fn()),
    enable() { A.settings.continueWatching = true; A.settings.continueWatchingApps = [source.id]; this.save(); },
    respond(index, data, status = 200) { Object.assign(requests[index], { status, responseText: JSON.stringify(data) }); requests[index].onload(); },
    advance(delay) { for (const [id, task] of [...timers]) if (task.delay === delay) { timers.delete(id); task.fn(); } }
  };
}
test('disabled is inert, and disabling or hiding aborts reads and rejects late callbacks', () => {
  const h = harness(); h.cw.start(); h.cw.start();
  assert.equal(h.reads, 0); assert.equal(h.requests.length, 0);
  h.enable(); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].method, 'GET');
  assert.deepEqual(h.requests[0].header, ['app_id', '123']);
  const url = new URL(h.requests[0].url);
  assert.equal(url.origin, 'http://localhost:9013');
  assert.equal(url.searchParams.get('module'), 'EBHelper');
  assert.equal(url.searchParams.get('func'), 'GetItems');
  h.A.settings.continueWatching = false; h.save();
  h.respond(0, [card('late')]); assert.equal(h.cw.items.length, 0); assert.equal(h.timers.size, 0);
  h.enable(); h.document.hidden = true; h.events.visibilitychange();
  assert.equal(h.requests[1].aborted, true); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.events.visibilitychange(); assert.equal(h.requests.length, 3);
});
test('source discovery groups hidden services by package and ignores preview-only metadata and names', () => {
  const h = harness();
  h.A.tizen.application.getAppMetaData = id => [{ key: prefix + (id === 'hidden.service' ? 'use.continue_watching' : 'use.preview'),
    value: id === 'hidden.service' ? 'bg_service' : 'true' }];
  const inventory = [{ id: 'hidden.service', packageId: 'pkg', show: false },
    { id: source.id, packageId: 'pkg', name: 'Renamed app - promotional text' }, { id: 'other.app', packageId: 'other', name: 'Video' }];
  assert.deepEqual(plain(h.cw.discover(inventory)), [{ ...source, name: 'Renamed app', icon: '', status: 'Not selected' }]);
  h.A.catalog.storeId = () => null;
  assert.equal(h.cw.discover(inventory)[0].status, 'App ID unavailable');
});
test('normalization keeps zero progress and distinct episodes, rejects other apps, deduplicates and orders true activity', () => {
  const h = harness(); h.cw.start(); h.enable();
  const data = [card('first', 1000), card('second', 2000000), card('first', 2000),
    card('wrong', 9999, { app_id: '456' }), card('missing', 5, { payload: '' }), card('oversized', 5, { payload: 'x'.repeat(16001) }),
    card('unknown', 0, { expiry: 9999999, release: 9999999 }), card('future', Date.now() * 100), null];
  h.respond(0, data);
  assert.deepEqual(plain(h.cw.items).map(x => x.key), ['video.app:second', 'video.app:first', 'video.app:unknown', 'video.app:future']);
  assert.equal(h.cw.items[0].playback, 0);
  assert.equal(h.cw.items[1].timestamp, 2000);
  assert.equal(h.cw.items[2].timestamp, 0);
  assert.throws(() => h.cw.normalize(source, {}), /Invalid feed/);
  assert.equal(h.cw.normalize(source, [card('millis', 1700000000000)])[0].timestamp, 1700000000);
});
test('empty feed retries are bounded; settled feeds do not poll; returning refreshes them', () => {
  const h = harness(); h.cw.start(); h.age(300001); h.enable();
  h.respond(0, []); h.advance(2000); h.respond(1, []); h.advance(2000); h.respond(2, []);
  assert.equal(h.cw.sources[0].status, 'No items available'); assert.equal(h.requests.length, 3);
  h.advance(30000); assert.equal(h.requests.length, 3); assert.equal(h.timers.size, 0);
  h.document.hidden = true; h.events.visibilitychange();
  h.document.hidden = false; h.events.visibilitychange();
  h.respond(3, [card('new')]); assert.equal(h.cw.items.length, 1);
  h.cw.refresh(); h.respond(4, []); assert.equal(h.cw.items.length, 1, 'a refresh does not clear the visible row');
  h.advance(2000); h.respond(5, []); h.advance(2000); h.respond(6, []); assert.equal(h.cw.items.length, 0);
  h.A.settings.continueWatchingApps = []; h.save(); const before = h.requests.length;
  h.advance(30000); assert.equal(h.requests.length, before);
});
test('failed or malformed requests stay isolated and returning recovers; selected payload is passed unchanged', () => {
  const h = harness(); h.cw.start(); h.age(300001); h.enable();
  h.respond(0, {}, 500); assert.match(h.cw.sources[0].status, /Unavailable/);
  assert.equal(h.timers.size, 0);
  h.events.visibilitychange(); h.respond(1, [card('chosen')]);
  const chosen = h.cw.items[0]; h.cw.open(chosen);
  assert.equal(h.launches[0].id, source.id); assert.deepEqual(h.watches, [source.id]);
  assert.deepEqual(h.launches[0].control.data, [{ key: 'PAYLOAD', value: [JSON.stringify({ values: chosen.payload })] }]);
  h.cw.open({ ...chosen }); assert.equal(h.launches.length, 1, 'reject stale/unlisted cards');
});
test('refresh keeps unchanged items and updates only changed records; deselection removes saved items', () => {
  const h = harness(); h.cw.start(); h.enable();
  h.respond(0, [card('one'), card('two')]);
  const items = h.cw.items, first = items[0], second = items[1];
  h.cw.refresh(); assert.equal(h.cw.items, items, 'keep the row while refreshing');
  h.respond(1, [card('one'), card('two')]);
  assert.equal(h.cw.items, items, 'unchanged results must not replace cards');
  h.advance(30000); assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  h.cw.refresh(); h.respond(2, [card('one', 1000, { playback: 100 }), card('two')]);
  assert.notEqual(h.cw.items[0], first); assert.equal(h.cw.items[1], second);
  h.cw.open(h.cw.items[1]); assert.equal(h.launches.length, 1);
  h.A.settings.continueWatchingApps = []; h.save(); assert.equal(h.cw.items.length, 0);
  h.enable(); assert.equal(h.cw.items.length, 0, 'deselected records are not retained');
});

// A cold TV can expose an empty or unavailable feed before its publisher is ready.
test('startup recovers a late feed without reopening the launcher and stops after success', () => {
  const h = harness(); h.cw.start(); h.enable();
  h.respond(0, {}, 503);
  for (const [index, delay] of [2000, 5000, 15000, 30000, 60000, 60000, 60000, 60000].entries()) {
    h.age(delay); h.advance(delay);
    assert.equal(h.requests.length, index + 2);
    h.respond(index + 1, index === 7 ? [card('late')] : []);
  }
  assert.deepEqual(plain(h.cw.items).map(i => i.key), ['video.app:late']);
  assert.equal(h.timers.size, 0); h.advance(120000);
  assert.equal(h.requests.length, 9); assert.equal(h.launches.length, 0);
});

test('startup retries have a fixed limit and are cancelled when disabled or hidden', () => {
  const empty = harness(); empty.cw.start(); empty.enable(); empty.respond(0, []);
  for (const [index, delay] of [2000, 5000, 15000, 30000, 60000, 60000, 60000, 60000].entries()) {
    empty.age(delay); empty.advance(delay); empty.respond(index + 1, []);
  }
  assert.equal(empty.cw.sources[0].status, 'No items available'); assert.equal(empty.timers.size, 0);
  empty.advance(120000); assert.equal(empty.requests.length, 9);
  for (const action of ['disable', 'hide']) {
    const h = harness(); h.cw.start(); h.enable(); h.respond(0, []);
    h.age(2000); h.advance(2000); h.respond(1, []);
    if (action === 'disable') { h.A.settings.continueWatching = false; h.save(); }
    else { h.document.hidden = true; h.events.visibilitychange(); }
    assert.equal(h.timers.size, 0); h.advance(5000); assert.equal(h.requests.length, 2);
  }
});

// A selection change near the end of startup must not start another five minutes.
test('startup retries share one deadline across refreshes', () => {
  const h = harness(); h.cw.start(); h.age(299001); h.enable(); h.respond(0, []);
  assert.equal([...h.timers.values()][0].delay, 999);
  h.age(999); h.advance(999); h.respond(1, []);
  assert.equal(h.timers.size, 0); assert.equal(h.requests.length, 2);
  assert.equal(h.cw.sources[0].status, 'No items available');
  h.age(1); h.cw.refresh(); h.respond(2, {}, 503);
  assert.equal(h.timers.size, 0, 'after startup errors wait for the next normal refresh');
});

// A cold TV starts near the Unix epoch before network time sets the real date.
test('startup retries survive wall-clock changes and still end after five elapsed minutes', () => {
  for (const [initial, corrected] of [[7680, 1793053630000], [1793053630000, 7680]]) {
    const h = harness(); h.setWall(initial); h.cw.start(); h.age(15445);
    h.setWall(corrected); h.enable(); h.requests[0].onerror();
    assert.equal([...h.timers.values()][0]?.delay, 2000, 'clock corrections must not end startup retries');
    h.age(2000); h.advance(2000); h.respond(1, []);
    h.age(5000); h.advance(5000); h.respond(2, [card('late')]);
    assert.equal(h.cw.items.length, 1); assert.equal(h.timers.size, 0);
    h.age(300001); h.cw.refresh(); h.requests[3].onerror();
    assert.equal(h.timers.size, 0, 'a backward correction must not extend the startup window');
  }
});

function twoSources(h) {
  h.A.apps.inventory.push({ id: 'other.app', packageId: 'other', name: 'Other' });
  h.A.catalog.storeId = id => id === source.id ? '123' : '456';
  h.A.settings.continueWatching = true; h.A.settings.continueWatchingApps = [source.id, 'other.app'];
  h.cw.start();
  return id => h.requests.findIndex(request => request.header[1] === id);
}

test('a later feed revalidates timestamps read before the TV clock was corrected', () => {
  const h = harness(), corrected = Date.now(), recent = Math.floor(corrected / 1000) - 3600;
  h.setWall(7680); const request = twoSources(h);
  h.respond(request('123'), [card('newer', recent)]);
  h.age(1000); h.setWall(corrected);
  h.respond(request('456'), [card('older', recent - 3600, { app_id: '456' })]);
  assert.deepEqual(plain(h.cw.items).map(item => item.key), ['video.app:newer', 'other.app:older']);
  assert.equal(h.cw.items[0].timestamp, recent);
  assert.equal(h.requests.length, 2);
});

test('clock correction reorders settled feeds without more reads and keeps future times invalid', () => {
  const h = harness(), corrected = Date.now(), recent = Math.floor(corrected / 1000) - 3600;
  h.setWall(7680); const request = twoSources(h);
  h.respond(request('123'), [card('older', recent - 3600), card('future', corrected * 100)]);
  h.respond(request('456'), [card('newer', recent - 60, { app_id: '456' }), card('newer', recent, { app_id: '456' })]);
  assert.equal(h.cw.items[0].timestamp, 0);
  h.age(1000); h.setWall(corrected); h.tick();
  assert.deepEqual(plain(h.cw.items).map(item => item.key), ['other.app:newer', 'video.app:older', 'video.app:future']);
  assert.deepEqual(plain(h.cw.items).map(item => item.timestamp), [recent, recent - 3600, 0]);
  assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  const items = h.cw.items; let updates = 0; h.cw.subscribe(() => updates++);
  h.age(10000); h.tick(); assert.equal(h.cw.items, items); assert.equal(updates, 0);
  h.setWall(corrected + 50000); h.document.hidden = true; h.tick(); assert.equal(updates, 0);
  h.document.hidden = false; h.A.settings.continueWatching = false; h.save(); updates = 0;
  h.setWall(corrected); h.tick(); assert.equal(updates, 0); assert.equal(h.requests.length, 2);
});
