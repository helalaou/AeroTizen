'use strict';
// Watcher integration tests. All clocks, Art replies and HTTP requests are local mocks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const url = require('node:url');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(__dirname + '/../launcher/service/index.js', 'utf8');
const SELF = 'DclHome001.Home';

function harness(options = {}) {
  let clock = 1000000;
  let serial = 0;
  const timers = new Map();
  const requests = [];
  const servers = [];
  const launches = [];
  const artReplies = [];
  const held = new Set();
  const statuses = new Map([[SELF, { running: true, visible: false }]]);
  let capability = options.capability === undefined ? true : options.capability;
  let powerState = 'on';
  let artOptions;
  let artValue = 'unknown';
  const art = {
    starts: 0, stops: 0,
    start() { this.starts += 1; },
    stop() { this.stops += 1; artValue = 'unknown'; artOptions.onChange('unknown', 'stopped'); },
    fresh(callback) { artReplies.push({ at: clock, callback }); },
    getState() { return { artMode: artValue }; }
  };
  function timer(fn, delay, interval) {
    const id = ++serial;
    timers.set(id, { at: clock + delay, fn, interval });
    return id;
  }
  function advance(ms) {
    const end = clock + ms;
    let steps = 0;
    for (;;) {
      let selected;
      for (const [id, entry] of timers) {
        if (entry.at <= end && (!selected || entry.at < selected.entry.at)) selected = { id, entry };
      }
      if (!selected) break;
      assert.ok(++steps < 100000, 'timer loop must settle');
      clock = selected.entry.at;
      if (selected.entry.interval) selected.entry.at += selected.entry.interval;
      else timers.delete(selected.id);
      selected.entry.fn();
    }
    clock = end;
  }
  function responseFor(path) {
    if (path === '/api/v2/') {
      return { status: 200, body: { device: capability === 'missing' ? {} : { FrameTVSupport: capability, PowerState: powerState } } };
    }
    const id = decodeURIComponent(path.slice('/api/v2/applications/'.length));
    return statuses.has(id) ? { status: 200, body: statuses.get(id) } : { status: 404, body: {} };
  }
  function respond(item, response = responseFor(item.options.path)) {
    const res = new EventEmitter();
    res.statusCode = response.status;
    item.callback(res);
    res.emit('data', typeof response.body === 'string' ? response.body : JSON.stringify(response.body));
    res.emit('end');
    item.replied = true;
  }
  const http = {
    get(options, callback) {
      const req = new EventEmitter();
      const item = { options, callback, req, replied: false };
      req.destroy = () => { item.destroyed = true; };
      requests.push(item);
      if (!held.has(options.path)) timer(() => respond(item), 0, 0);
      return req;
    },
    createServer(handler) {
      const server = new EventEmitter();
      server.handler = handler;
      server.listen = (port, host) => { server.port = port; server.host = host; };
      server.close = () => { server.closed = true; };
      servers.push(server);
      return server;
    }
  };
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'http') return http;
      if (name === './artmode') return config => { artOptions = config; return art; };
      if (name === 'url') return url;
      throw new Error('Unexpected require: ' + name);
    },
    Date: { now: () => clock },
    setTimeout: (fn, ms) => timer(fn, ms, 0),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timer(fn, ms, ms),
    clearInterval: id => timers.delete(id),
    tizen: { application: { launch(id, success) {
      launches.push({ at: clock, id });
      statuses.set(SELF, { running: true, visible: true });
      if (success) success();
    } } }
  };
  vm.runInNewContext(source, context, { filename: 'watcher.js' });
  function control(path = '/') {
    let body;
    servers[0].handler({ method: 'GET', url: path }, { writeHead() {}, end(value) { body = JSON.parse(value); } });
    return body;
  }
  return {
    api: context.module.exports, art, artReplies, requests, servers, launches, statuses,
    advance, control, state: () => control(),
    setArt(value) { artValue = value; artOptions.onChange(value, 'mock reply'); },
    answerArt(value) {
      assert.ok(artReplies.length, 'a fresh Art query must exist');
      const waiter = artReplies.shift();
      artValue = value;
      artOptions.onChange(value, 'matching-reply');
      waiter.callback(value);
    },
    hold(id) { held.add('/api/v2/applications/' + encodeURIComponent(id)); },
    release(id) { held.delete('/api/v2/applications/' + encodeURIComponent(id)); },
    pendingRequest(id) {
      const path = '/api/v2/applications/' + encodeURIComponent(id);
      return requests.find(item => item.options.path === path && !item.replied);
    },
    respond, setCapability(value) { capability = value; },
    setPowerState(value) { powerState = value; },
    now: () => clock
  };
}

function ready(options) {
  const h = harness(options);
  h.api.onStart(); h.advance(0);
  h.setArt('off');
  return h;
}
function candidate(h) {
  h.advance(4500);
  assert.equal(h.artReplies.length, 1, 'stable hidden Home requests a fresh Art read');
  assert.equal(h.launches.length, 0);
}
function passFirst(h) {
  h.answerArt('off'); h.advance(0);
  assert.equal(h.artReplies.length, 1, 'app recheck requires another fresh Art read');
}
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('Home reclaim requires hidden debounce, two fresh off replies and app rechecks', () => {
  const h = ready();
  h.advance(4499);
  assert.equal(h.artReplies.length, 0);
  h.advance(1);
  assert.equal(h.launches.length, 0);
  passFirst(h);
  h.answerArt('off');
  h.advance(0);
  assert.equal(h.launches.length, 1);
  assert.equal(h.launches[0].id, SELF);
  assert.equal(h.state().guard.launchCalls, 1);
});

test('Art on and unknown prevent startup and normal reclaim', () => {
  for (const value of ['on', 'unknown']) {
    const h = ready(); h.setArt(value); h.advance(12000);
    assert.equal(h.launches.length, 0);
    assert.equal(h.artReplies.length, 0);
    assert.ok(h.state().heartbeats > 30);
  }
});

test('cached off without a matching fresh reply never launches', () => {
  const h = ready(); candidate(h); h.advance(15000);
  assert.equal(h.launches.length, 0);
  assert.ok(h.state().guard.history.some(item => item.detail === 'guard deadline'));
});

test('Art on invalidates either fresh check, including a later stale off callback', () => {
  for (const finalStage of [false, true]) {
    const h = ready(); candidate(h);
    if (finalStage) passFirst(h);
    h.setArt('on'); h.answerArt('off'); h.advance(1000);
    assert.equal(h.launches.length, 0);
    assert.equal(h.state().guard.pending, null);
  }
});

test('leave, watch, home and app inventory changes cancel a pending relaunch', () => {
  for (const path of ['/leave', '/watch?id=AppB', '/home', '/apps?ids=AppB']) {
    const h = ready(); candidate(h); passFirst(h);
    h.control(path); h.answerArt('off');
    assert.equal(h.launches.length, 0, path);
    assert.equal(h.state().guard.pending, null, path);
    if (path === '/leave') {
      h.advance(15000);
      assert.equal(h.launches.length, 0);
      assert.equal(h.state().leaving, true);
    }
  }
});

test('final recheck stands aside when an app becomes visible or newly running', () => {
  for (const visible of [true, false]) {
    const h = ready();
    h.statuses.set('AppB', { running: false, visible: false });
    h.control('/apps?ids=AppB'); candidate(h);
    h.statuses.set('AppB', { running: true, visible });
    h.answerArt('off'); h.advance(0);
    assert.equal(h.launches.length, 0);
    assert.equal(h.artReplies.length, 0);
    assert.equal(h.state().watched, 'AppB');
  }
});

test('Art change while SELF recheck is outstanding invalidates the late response', () => {
  const h = ready(); candidate(h);
  h.hold(SELF); h.answerArt('off');
  const req = h.pendingRequest(SELF);
  assert.ok(req);
  h.setArt('on'); h.respond(req); h.advance(0);
  assert.equal(h.launches.length, 0);
  assert.equal(h.artReplies.length, 0);
});

test('Art exit restarts the grace period before Home can be reclaimed', () => {
  const h = ready(); h.setArt('on'); h.advance(12000);
  h.setArt('off'); h.advance(2499);
  assert.equal(h.launches.length, 0);
  assert.equal(h.artReplies.length, 0);
  h.advance(201);
  assert.equal(h.artReplies.length, 1);
  passFirst(h); h.answerArt('off'); h.advance(0);
  assert.equal(h.launches.length, 1);
});

test('unknown capability blocks; only explicit non-Frame capability bypasses Art', () => {
  for (const capability of ['missing', null, 'yes']) {
    const h = harness({ capability }); h.api.onStart(); h.advance(12000);
    assert.equal(h.launches.length, 0);
    assert.equal(h.art.starts, 0);
    assert.equal(h.state().guard.capability, 'unknown');
  }
  for (const capability of [false, 'false']) {
    const h = harness({ capability }); h.api.onStart(); h.advance(5000);
    assert.equal(h.launches.length, 1);
    assert.equal(h.art.starts, 0);
    assert.equal(h.artReplies.length, 0);
  }
});

test('failed app checks and late responses cannot authorize a relaunch', () => {
  const h = ready(); candidate(h);
  h.hold(SELF); h.answerArt('off');
  const req = h.pendingRequest(SELF);
  h.advance(1600);
  assert.equal(h.launches.length, 0);
  h.respond(req); h.advance(0);
  assert.equal(h.launches.length, 0);
  assert.equal(h.artReplies.length, 0);
});

test('watch change cancels a scan and an unavailable HbbTV host is not reclaimed', () => {
  const h = ready();
  h.statuses.set('AppA', { running: true, visible: true });
  h.control('/watch?id=AppA');
  h.advance(4500);
  assert.equal(h.state().seen, true);
  h.statuses.set('AppA', { running: true, visible: false });
  h.hold('AppA'); h.advance(300);
  const req = h.pendingRequest('AppA'); assert.ok(req);
  h.control('/watch?id=org.tizen.hbbtv');
  h.respond(req); h.advance(12000);
  assert.equal(h.launches.length, 0);
  assert.equal(h.state().watched, 'org.tizen.hbbtv');
  assert.equal(h.artReplies.length, 0);
});

test('watched app disappearance needs debounce and the same double Art guard', () => {
  const h = ready();
  h.statuses.set('AppA', { running: true, visible: true });
  h.control('/apps?ids=AppA'); h.control('/watch?id=AppA');
  h.advance(4500);
  assert.equal(h.state().seen, true);
  h.statuses.set('AppA', { running: true, visible: false });
  h.advance(1799);
  assert.equal(h.artReplies.length, 0);
  h.advance(1);
  assert.equal(h.artReplies.length, 1);
  passFirst(h); h.answerArt('off'); h.advance(0);
  assert.equal(h.launches.length, 1);
});

test('lifecycle starts once and exit cancels pending authorization', () => {
  const h = ready(); h.api.onStart();
  assert.equal(h.servers.length, 1);
  assert.equal(h.art.starts, 1);
  candidate(h); passFirst(h);
  h.api.onExit(); h.answerArt('off'); h.advance(12000);
  assert.equal(h.launches.length, 0);
  assert.equal(h.art.stops, 1);
  assert.equal(h.servers[0].closed, true);
});

test('a buffered Art-on veto after the final off reply prevents commit', () => {
  const h = ready(); candidate(h); passFirst(h);
  h.answerArt('off');
  assert.equal(h.launches.length, 0);
  h.setArt('on'); h.advance(0);
  assert.equal(h.launches.length, 0);
});

test('missing or standby power status denies a relaunch despite fresh Art off', () => {
  for (const value of [undefined, 'standby', 'off', 'ON']) {
    const h = ready(); candidate(h); h.setPowerState(value);
    h.answerArt('off'); h.advance(0);
    assert.equal(h.launches.length, 0);
    assert.equal(h.artReplies.length, 0);
    assert.equal(h.state().guard.lastBlocked, 'TV power state unavailable or not on');
  }
});

test('Art round trip preserves a known app with unavailable visibility', () => {
  const h = ready();
  h.statuses.set('Cobalt', { running: true, visible: false });
  h.control('/apps?ids=Cobalt'); h.control('/watch?id=Cobalt');
  h.advance(5000);
  h.setArt('on'); h.advance(10000);
  h.setArt('off'); h.advance(10000);
  assert.equal(h.state().watched, 'Cobalt');
  assert.equal(h.launches.length, 0);
  assert.equal(h.artReplies.length, 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { failed += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
console.log(`${tests.length - failed}/${tests.length} watcher integration tests passed`);
if (failed) process.exitCode = 1;
