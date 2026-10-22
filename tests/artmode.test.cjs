'use strict';
// Focused protocol and lifecycle tests. No network sockets or TV access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(__dirname + '/../launcher/service/artmode.js', 'utf8');

function harness(options = {}) {
  let clock = 1000000;
  let nextId = 0;
  const timers = new Map();
  const requests = [];
  const changes = [];
  const imports = [];
  const sockets = [];
  function timer(fn, delay, interval) {
    const id = ++nextId;
    timers.set(id, { at: clock + delay, fn, interval });
    return id;
  }
  function advance(ms) {
    const end = clock + ms;
    for (;;) {
      let selected;
      for (const [id, entry] of timers) {
        if (entry.at <= end && (!selected || entry.at < selected.entry.at)) {
          selected = { id, entry };
        }
      }
      if (!selected) break;
      clock = selected.entry.at;
      if (selected.entry.interval) selected.entry.at += selected.entry.interval;
      else timers.delete(selected.id);
      selected.entry.fn();
    }
    clock = end;
  }
  const http = {
    request(options) {
      const req = new EventEmitter();
      req.options = options;
      req.end = () => { req.ended = true; };
      req.destroy = () => { req.destroyed = true; };
      requests.push(req);
      return req;
    }
  };
  const context = {
    module: { exports: {} }, Buffer, Date: { now: () => clock },
    process: { versions: { node: 'test-runtime' } },
    require(name) {
      imports.push(name);
      if (name === 'http') return http;
      if (name === 'crypto' && !options.noCrypto) return crypto;
      throw new Error('Module unavailable: ' + name);
    },
    setTimeout: (fn, ms) => timer(fn, ms, 0),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timer(fn, ms, ms),
    clearInterval: id => timers.delete(id)
  };
  vm.runInNewContext(source, context, { filename: 'artmode.js' });
  const api = context.module.exports({ onChange: (value, reason) => changes.push({ value, reason }) });
  function upgrade(index = requests.length - 1, valid = true) {
    const req = requests[index];
    const socket = new EventEmitter();
    socket.writes = [];
    socket.write = data => { socket.writes.push(Buffer.from(data)); };
    socket.destroy = () => { socket.destroyed = true; };
    sockets.push(socket);
    const accept = crypto.createHash('sha1').update(req.options.headers['Sec-WebSocket-Key'] +
      '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    req.emit('upgrade', { statusCode: 101, headers: {
      upgrade: 'websocket', connection: 'keep-alive, Upgrade',
      'sec-websocket-accept': valid ? accept : 'wrong'
    } }, socket, Buffer.alloc(0));
    return socket;
  }
  return { api, requests, sockets, changes, imports, advance,
    state: () => api.getState(), upgrade };
}
function frame(opcode, payload, fin = true) {
  payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const extra = payload.length < 126 ? 0 : payload.length < 65536 ? 2 : 8;
  const out = Buffer.alloc(2 + extra + payload.length);
  out[0] = (fin ? 128 : 0) | opcode;
  out[1] = extra === 0 ? payload.length : extra === 2 ? 126 : 127;
  if (extra === 2) out.writeUInt16BE(payload.length, 2);
  if (extra === 8) out.writeUInt32BE(payload.length, 6);
  payload.copy(out, 2 + extra);
  return out;
}
function text(value) { return frame(1, JSON.stringify(value)); }
function decoded(buffer) {
  assert.ok(buffer[1] & 128, 'client frames must be masked');
  const length = buffer[1] & 127;
  const size = length === 126 ? buffer.readUInt16BE(2) : length;
  const maskAt = length === 126 ? 4 : 2;
  const payload = Buffer.alloc(size);
  for (let i = 0; i < size; i++) payload[i] = buffer[maskAt + 4 + i] ^ buffer[maskAt + i % 4];
  return { opcode: buffer[0] & 15, payload };
}
function ready(h) {
  h.api.start();
  const socket = h.upgrade();
  socket.emit('data', text({ event: 'ms.channel.ready' }));
  return socket;
}
function query(socket) {
  const packet = JSON.parse(decoded(socket.writes[socket.writes.length - 1]).payload.toString());
  assert.equal(packet.method, 'ms.channel.emit');
  assert.equal(packet.params.event, 'art_app_request');
  assert.equal(packet.params.to, 'broadcast');
  const request = JSON.parse(packet.params.data);
  assert.equal(request.request, 'get_artmode_status');
  assert.deepEqual(Object.keys(request).sort(), ['id', 'request', 'request_id']);
  assert.equal(request.id, request.request_id);
  return request;
}
function reply(id, value) {
  return { event: 'd2d_service_message', data: JSON.stringify({
    event: 'get_artmode_status', request_id: id, value
  }) };
}
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('imports are lazy and transport uses only fixed loopback Art status queries', () => {
  const h = harness();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.imports, []);
  h.api.start(); h.api.start();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.imports, ['http', 'crypto']);
  assert.equal(h.requests[0].options.host, '127.0.0.1');
  assert.equal(h.requests[0].options.port, 8001);
  assert.equal(h.requests[0].options.method, 'GET');
  assert.equal(h.requests[0].options.path, '/api/v2/channels/com.samsung.art-app?name=QWVyb1RpemVu');
  const socket = h.upgrade();
  socket.emit('data', text({ event: 'ms.channel.ready' }));
  query(socket);
  assert.equal(h.state().sentQueries, 1);
});
test('upgrade validation rejects an incorrect accept value and backs off four seconds', () => {
  const h = harness(); h.api.start();
  const socket = h.upgrade(0, false);
  assert.equal(socket.destroyed, true);
  assert.equal(socket.writes.length, 0);
  assert.equal(h.state().artMode, 'unknown');
  h.advance(3999); assert.equal(h.requests.length, 1);
  h.advance(1); assert.equal(h.requests.length, 2);
});
test('only correlated replies authorize off, including split and fragmented frames', () => {
  const h = harness(); const socket = ready(h);
  const request = query(socket);
  socket.emit('data', text({ event: 'art_app_request', data: { id: request.id, value: 'off' } }));
  socket.emit('data', text(reply('wrong-id', 'off')));
  socket.emit('data', text({ event: 'd2d_service_message', data: {
    event: 'unknown_event', request_id: request.id, value: 'off'
  } }));
  assert.equal(h.state().matchedReplies, 0);
  assert.equal(h.state().artMode, 'unknown');
  const json = Buffer.from(JSON.stringify(reply(request.id, 'off')));
  const fragmented = Buffer.concat([frame(1, json.subarray(0, 23), false), frame(0, json.subarray(23))]);
  socket.emit('data', fragmented.subarray(0, 3));
  socket.emit('data', fragmented.subarray(3));
  assert.equal(h.state().artMode, 'off');
  assert.equal(h.state().matchedReplies, 1);
  assert.equal(h.state().latest.requestId, request.id);
});
test('ping gets a masked pong with the same payload', () => {
  const h = harness(); const socket = ready(h);
  socket.emit('data', frame(9, 'probe'));
  const pong = decoded(socket.writes[1]);
  assert.equal(pong.opcode, 10);
  assert.equal(pong.payload.toString(), 'probe');
  assert.equal(h.state().sentQueries, 1);
});
test('reply timeout becomes unknown and a later query may report Art on', () => {
  const h = harness(); const socket = ready(h);
  const first = query(socket);
  h.advance(2000);
  assert.equal(h.state().artMode, 'unknown');
  assert.equal(h.state().latest.reason, 'reply-timeout');
  h.advance(1000);
  const second = query(socket);
  assert.notEqual(second.id, first.id);
  socket.emit('data', text(reply(first.id, 'off')));
  assert.equal(h.state().matchedReplies, 0);
  socket.emit('data', text(reply(second.id, 'on')));
  assert.equal(h.state().artMode, 'on');
});
test('fresh callbacks cannot use cached off and simultaneous callers share a new query', () => {
  const h = harness(); const socket = ready(h);
  const initial = query(socket);
  socket.emit('data', text(reply(initial.id, 'off')));
  const a = []; const b = [];
  h.api.fresh(value => a.push(value));
  h.api.fresh(value => b.push(value));
  assert.deepEqual(a, []); assert.deepEqual(b, []);
  h.advance(0);
  const fresh = query(socket);
  assert.notEqual(fresh.id, initial.id);
  assert.equal(h.state().sentQueries, 2);
  socket.emit('data', text(reply(initial.id, 'off')));
  assert.deepEqual(a, []);
  socket.emit('data', text(reply(fresh.id, 'off')));
  assert.deepEqual(a, ['off']); assert.deepEqual(b, ['off']);
  assert.deepEqual(h.changes.map(item => item.value), ['off', 'off']);
});
test('fresh caller queues behind an existing query and requires its own new reply', () => {
  const h = harness(); const socket = ready(h);
  const periodic = query(socket);
  const values = [];
  h.api.fresh(value => values.push(value)); h.advance(0);
  assert.equal(h.state().sentQueries, 1);
  socket.emit('data', text(reply(periodic.id, 'off')));
  assert.deepEqual(values, []);
  h.advance(0);
  const fresh = query(socket);
  assert.notEqual(fresh.id, periodic.id);
  socket.emit('data', text(reply(fresh.id, 'on')));
  assert.deepEqual(values, ['on']);
});
test('a fresh call during another fresh request requires another new request', () => {
  const h = harness(); const socket = ready(h);
  socket.emit('data', text(reply(query(socket).id, 'off')));
  const first = []; const second = [];
  h.api.fresh(value => first.push(value)); h.advance(0);
  const request = query(socket);
  h.api.fresh(value => second.push(value)); h.advance(0);
  socket.emit('data', text(reply(request.id, 'off')));
  assert.deepEqual(first, ['off']); assert.deepEqual(second, []);
  h.advance(0);
  const next = query(socket);
  assert.notEqual(next.id, request.id);
  socket.emit('data', text(reply(next.id, 'off')));
  assert.deepEqual(second, ['off']);
});
test('fresh deadline is at most 2500 ms even when queued behind an older request', () => {
  const h = harness(); const socket = ready(h);
  const values = [];
  h.api.fresh(value => values.push(value)); h.advance(0);
  h.advance(2000); // The periodic request times out; a new fresh request starts.
  const last = query(socket);
  assert.equal(h.state().sentQueries, 2);
  h.advance(499); assert.deepEqual(values, []);
  h.advance(1); assert.deepEqual(values, ['unknown']);
  assert.equal(h.state().artMode, 'unknown');
  assert.equal(h.state().latest.reason, 'fresh-timeout');
  socket.emit('data', text(reply(last.id, 'off')));
  assert.equal(h.state().artMode, 'unknown');
  assert.deepEqual(values, ['unknown']);
});
test('Art-on events cancel a pending fresh off reply; unsolicited off grants nothing', () => {
  const h = harness(); const socket = ready(h);
  socket.emit('data', text(reply(query(socket).id, 'off')));
  const values = [];
  h.api.fresh(value => values.push(value)); h.advance(0);
  const request = query(socket);
  socket.emit('data', text({ event: 'd2d_service_message', data: {
    event: 'artmode_status', value: 'on'
  } }));
  assert.equal(h.state().artMode, 'on');
  assert.deepEqual(values, ['on']);
  socket.emit('data', text(reply(request.id, 'off')));
  socket.emit('data', text({ event: 'd2d_service_message', data: {
    event: 'artmode_status', value: 'off'
  } }));
  assert.equal(h.state().artMode, 'on');
  assert.deepEqual(values, ['on']);
});
test('standby cancels pending work and invalidates the prior off status immediately', () => {
  const h = harness(); const socket = ready(h);
  socket.emit('data', text(reply(query(socket).id, 'off')));
  const values = [];
  h.api.fresh(value => values.push(value)); h.advance(0);
  const request = query(socket);
  socket.emit('data', text({ event: 'd2d_service_message', data: { event: 'go_to_standby' } }));
  assert.equal(h.state().artMode, 'unknown');
  assert.deepEqual(values, ['unknown']);
  socket.emit('data', text(reply(request.id, 'off')));
  assert.equal(h.state().artMode, 'unknown');
});
test('connection loss invalidates valid off and all pending callbacks before retry', () => {
  const h = harness(); const socket = ready(h);
  socket.emit('data', text(reply(query(socket).id, 'off')));
  const values = [];
  h.api.fresh(value => values.push(value)); h.advance(0);
  socket.emit('error', new Error('offline'));
  assert.equal(h.state().artMode, 'unknown');
  assert.deepEqual(values, ['unknown']);
  assert.equal(socket.destroyed, true);
  h.advance(3999); assert.equal(h.requests.length, 1);
  h.advance(1); assert.equal(h.requests.length, 2);
});
test('oversized, masked, and invalid control server frames close safely', () => {
  const h = harness(); const socket = ready(h);
  const header = Buffer.alloc(10); header[0] = 129; header[1] = 127;
  header.writeUInt32BE(131073, 6); socket.emit('data', header);
  assert.equal(socket.destroyed, true);
  const j = harness(); const other = ready(j);
  other.emit('data', Buffer.from([129, 128]));
  assert.equal(other.destroyed, true);
  const k = harness(); const invalid = ready(k);
  invalid.emit('data', frame(9, 'x', false));
  assert.equal(invalid.destroyed, true);
});
test('polling continues beyond ten minutes and diagnostics stay bounded and copied', () => {
  const h = harness(); const socket = ready(h);
  h.advance(660000);
  assert.equal(h.state().phase, 'querying');
  assert.ok(socket.writes.length > 200);
  assert.ok(h.state().samples.length <= 64);
  assert.ok(h.state().events.length <= 64);
  const copy = h.state(); copy.events.length = 0; copy.runtime.crypto = false;
  assert.notEqual(h.state().events.length, 0);
  assert.equal(h.state().runtime.crypto, true);
  h.api.stop();
  const count = socket.writes.length;
  h.advance(60000); socket.emit('data', frame(9, 'late'));
  assert.equal(h.state().phase, 'stopped');
  assert.equal(socket.destroyed, true);
  assert.equal(socket.writes.length, count);
});
test('unavailable crypto and stopped client fail closed without outbound traffic', () => {
  const h = harness({ noCrypto: true });
  assert.deepEqual(h.imports, []);
  const values = [];
  h.api.fresh(value => values.push(value));
  h.api.start(); h.api.fresh(value => values.push(value));
  assert.deepEqual(values, ['unknown', 'unknown']);
  assert.equal(h.requests.length, 0);
  assert.equal(h.state().runtime.crypto, false);
  assert.equal(h.state().phase, 'unavailable');
});

for (const [name, fn] of tests) {
  fn();
  process.stdout.write('PASS ' + name + '\n');
}
process.stdout.write(tests.length + ' tests passed\n');
