'use strict';

// Read-only Samsung Art Mode client. An off cache is never a launch permit.
module.exports = function createArtMode(options) {
  options = options || {};
  var http = null;
  var crypto = null;
  var running = false;
  var active = null;
  var retryTimer = null;
  var queryTimer = null;
  var freshTimer = null;
  var pending = null;
  var waiting = [];
  var sequence = 0;
  var LIMIT = 131072;
  var RING = 64;
  var state = {
    phase: 'not-started', artMode: 'unknown', generation: 0,
    sentQueries: 0, matchedReplies: 0, latest: null, samples: [], events: [],
    runtime: { http: false, crypto: false, buffer: typeof Buffer !== 'undefined' }
  };

  function now() { return Date.now(); }
  function ring(list, item) {
    list.push(item);
    if (list.length > RING) { list.shift(); }
  }
  function event(kind, detail) {
    ring(state.events, { at: now(), kind: kind, detail: detail || null });
  }
  function sample(value, reason, id, sentAt) {
    var item = { at: now(), value: value, reason: reason,
      requestId: id || null, sentAt: sentAt || null, generation: state.generation };
    state.artMode = value;
    state.latest = item;
    ring(state.samples, item);
    if (typeof options.onChange === 'function') {
      try { options.onChange(value, reason); }
      catch (e) { event('callback-error', 'status callback failed'); }
    }
  }
  function bytes(value) { return new Buffer(value); }
  function allocate(length) {
    var out = new Buffer(length);
    out.fill(0);
    return out;
  }
  function finish(waiter, value) {
    if (waiter.done) { return; }
    waiter.done = true;
    clearTimeout(waiter.timer);
    try { waiter.callback(value); }
    catch (e) { event('callback-error', 'fresh callback failed'); }
  }
  function finishAll(waiters, value) {
    for (var i = 0; i < waiters.length; i += 1) { finish(waiters[i], value); }
  }
  function invalidate(reason, value) {
    var old = pending;
    pending = null;
    if (old) { clearTimeout(old.timer); }
    var queued = waiting;
    waiting = [];
    clearTimeout(freshTimer); freshTimer = null;
    sample(value || 'unknown', reason, old && old.id, old && old.sentAt);
    if (old) { finishAll(old.waiters, value || 'unknown'); }
    finishAll(queued, value || 'unknown');
  }
  function clearTransportTimers() {
    clearTimeout(retryTimer); retryTimer = null;
    clearTimeout(queryTimer); queryTimer = null;
    clearTimeout(freshTimer); freshTimer = null;
  }
  function dispose(conn) {
    if (!conn) { return; }
    clearTimeout(conn.timer);
    conn.failed = true;
    if (conn.socket) { conn.socket.destroy(); }
    if (conn.request) {
      if (typeof conn.request.destroy === 'function') { conn.request.destroy(); }
      else if (typeof conn.request.abort === 'function') { conn.request.abort(); }
    }
  }
  function lost(conn, reason) {
    if (active !== conn || conn.failed) { return; }
    active = null;
    dispose(conn);
    clearTransportTimers();
    invalidate(reason);
    event('connection-lost', reason);
    if (running) {
      state.phase = 'retry-wait';
      retryTimer = setTimeout(connect, 4000);
    }
  }
  function sendFrame(conn, opcode, payload) {
    if (!running || active !== conn || conn.failed || !conn.socket) { return false; }
    try {
      if (payload.length > 65535) { throw new Error('outbound frame too large'); }
      var extra = payload.length < 126 ? 0 : 2;
      var frame = allocate(2 + extra + 4 + payload.length);
      frame[0] = 128 | opcode;
      frame[1] = 128 | (extra ? 126 : payload.length);
      if (extra) { frame.writeUInt16BE(payload.length, 2); }
      var maskAt = 2 + extra;
      var mask = crypto.randomBytes(4);
      mask.copy(frame, maskAt);
      for (var i = 0; i < payload.length; i += 1) {
        frame[maskAt + 4 + i] = payload[i] ^ mask[i % 4];
      }
      conn.socket.write(frame);
      return true;
    } catch (e) { lost(conn, 'write failed'); return false; }
  }
  function pumpFresh() {
    clearTimeout(freshTimer); freshTimer = null;
    if (!waiting.length || pending) { return; }
    if (!running || !active || !active.ready || active.failed) {
      var queued = waiting; waiting = [];
      finishAll(queued, 'unknown');
      return;
    }
    var callers = waiting; waiting = [];
    requestArt(active, callers);
  }
  function queuePump() {
    if (!freshTimer && waiting.length) { freshTimer = setTimeout(pumpFresh, 0); }
  }
  function requestArt(conn, waiters) {
    if (!running || active !== conn || !conn.ready || pending) { return; }
    var id;
    try { id = 'aerotizen-' + now() + '-' + (++sequence) + '-' + crypto.randomBytes(4).toString('hex'); }
    catch (e) {
      finishAll(waiters || [], 'unknown');
      lost(conn, 'request ID failed'); return;
    }
    var sentAt = now();
    var request = { request: 'get_artmode_status', id: id, request_id: id };
    var message = { method: 'ms.channel.emit', params: {
      event: 'art_app_request', to: 'broadcast', data: JSON.stringify(request)
    } };
    var current = { id: id, sentAt: sentAt, timer: null, waiters: waiters || [] };
    pending = current;
    if (!sendFrame(conn, 1, bytes(JSON.stringify(message)))) { return; }
    state.sentQueries += 1;
    event('query-sent', id);
    current.timer = setTimeout(function () {
      if (pending !== current) { return; }
      pending = null;
      sample('unknown', 'reply-timeout', id, sentAt);
      finishAll(current.waiters, 'unknown');
      queuePump();
    }, 2000);
  }
  function scheduleQuery(conn) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(function () {
      if (!running || active !== conn || conn.failed) { return; }
      if (waiting.length) { pumpFresh(); }
      else { requestArt(conn); }
      scheduleQuery(conn);
    }, 3000);
  }
  function message(conn, payload) {
    var msg;
    try { msg = JSON.parse(payload.toString('utf8')); }
    catch (e) { event('invalid-message', 'JSON parse failed'); return; }
    if (!msg || typeof msg !== 'object') { return; }
    if (msg.event === 'ms.channel.ready') {
      if (!conn.ready) {
        conn.ready = true;
        state.phase = 'querying';
        clearTimeout(conn.timer);
        event('channel-ready');
        if (waiting.length) { pumpFresh(); }
        else { requestArt(conn); }
        scheduleQuery(conn);
      }
      return;
    }
    if (msg.event === 'go_to_standby') { invalidate('standby-event'); return; }
    if (msg.event !== 'd2d_service_message') { return; }
    var reply;
    try { reply = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data; }
    catch (e) { event('invalid-reply', 'JSON parse failed'); return; }
    if (!reply || typeof reply !== 'object') { return; }
    var value = reply.value || reply.status;
    var statusEvent = reply.event === 'get_artmode_status' || reply.event === 'artmode_status';
    if (statusEvent && pending && (reply.request_id || reply.id) === pending.id) {
      if (value !== 'on' && value !== 'off') { invalidate('invalid-reply'); return; }
      var current = pending;
      pending = null;
      clearTimeout(current.timer);
      state.matchedReplies += 1;
      sample(value, 'matching-reply', current.id, current.sentAt);
      finishAll(current.waiters, running && active === conn ? value : 'unknown');
      queuePump();
      return;
    }
    // Broadcast events can veto a launch, but only a correlated query can allow it.
    if (reply.event === 'go_to_standby') { invalidate('standby-event'); }
    else if ((statusEvent || reply.event === 'artmode_changed') && value === 'on') {
      invalidate('art-on-event', 'on');
    }
  }
  function receive(conn, chunk) {
    if (!running || active !== conn || conn.failed) { return; }
    if (conn.input.length + chunk.length > LIMIT + 14) { lost(conn, 'input limit'); return; }
    conn.input = Buffer.concat([conn.input, chunk]);
    while (conn.input.length >= 2) {
      var input = conn.input;
      var fin = (input[0] & 128) !== 0;
      var opcode = input[0] & 15;
      var length = input[1] & 127;
      var offset = 2;
      if ((input[0] & 112) || (input[1] & 128)) { lost(conn, 'invalid frame flags'); return; }
      if (length === 126) {
        if (input.length < 4) { return; }
        length = input.readUInt16BE(2); offset = 4;
      } else if (length === 127) {
        if (input.length < 10) { return; }
        if (input.readUInt32BE(2) !== 0) { lost(conn, 'frame limit'); return; }
        length = input.readUInt32BE(6); offset = 10;
      }
      if (length > LIMIT) { lost(conn, 'frame limit'); return; }
      if (opcode >= 8 && (!fin || length > 125)) { lost(conn, 'invalid control frame'); return; }
      if (input.length < offset + length) { return; }
      var payload = input.slice(offset, offset + length);
      conn.input = input.slice(offset + length);
      if (opcode === 8) { lost(conn, 'peer closed'); return; }
      if (opcode === 9) {
        event('ping');
        if (!sendFrame(conn, 10, payload)) { return; }
      } else if (opcode === 10) { event('pong'); }
      else if (opcode === 1) {
        if (conn.fragments) { lost(conn, 'overlapping text frames'); return; }
        if (fin) { message(conn, payload); }
        else { conn.fragments = [payload]; conn.fragmentSize = payload.length; }
      } else if (opcode === 0) {
        if (!conn.fragments) { lost(conn, 'unexpected continuation'); return; }
        conn.fragmentSize += payload.length;
        if (conn.fragmentSize > LIMIT) { lost(conn, 'message limit'); return; }
        conn.fragments.push(payload);
        if (fin) {
          var full = Buffer.concat(conn.fragments, conn.fragmentSize);
          conn.fragments = null; conn.fragmentSize = 0;
          message(conn, full);
        }
      } else { lost(conn, 'unsupported opcode'); return; }
      if (active !== conn || conn.failed) { return; }
    }
  }
  function connect() {
    if (!running || active) { return; }
    state.phase = 'connecting';
    state.generation += 1;
    var conn = { failed: false, ready: false, socket: null, request: null,
      input: allocate(0), fragments: null, fragmentSize: 0, timer: null };
    active = conn;
    try {
      var key = crypto.randomBytes(16).toString('base64');
      var accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      conn.request = http.request({ host: '127.0.0.1', port: 8001, method: 'GET',
        path: '/api/v2/channels/com.samsung.art-app?name=QWVyb1RpemVu',
        headers: { Connection: 'Upgrade', Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key }
      });
      conn.request.on('upgrade', function (res, socket, head) {
        if (!running || active !== conn || conn.failed) { socket.destroy(); return; }
        conn.socket = socket;
        if (res.statusCode !== 101 || String(res.headers.upgrade || '').toLowerCase() !== 'websocket' ||
            !/(^|,)\s*upgrade\s*(,|$)/i.test(String(res.headers.connection || '')) ||
            res.headers['sec-websocket-accept'] !== accept) {
          lost(conn, 'invalid upgrade'); return;
        }
        event('websocket-open');
        socket.on('data', function (chunk) { receive(conn, chunk); });
        socket.on('error', function () { lost(conn, 'socket error'); });
        socket.on('end', function () { lost(conn, 'socket ended'); });
        socket.on('close', function () { lost(conn, 'socket closed'); });
        if (head && head.length) { receive(conn, head); }
      });
      conn.request.on('response', function (res) {
        if (typeof res.resume === 'function') { res.resume(); }
        lost(conn, 'HTTP response without upgrade');
      });
      conn.request.on('error', function () { lost(conn, 'request error'); });
      conn.timer = setTimeout(function () { lost(conn, 'channel timeout'); }, 2000);
      conn.request.end();
    } catch (e) { lost(conn, 'connect failed'); }
  }
  function start() {
    if (running) { return; }
    running = true;
    state.phase = 'starting';
    try { http = require('http'); state.runtime.http = true; }
    catch (e) { event('runtime-error', 'http module unavailable'); }
    try { crypto = require('crypto'); state.runtime.crypto = true; }
    catch (e) { event('runtime-error', 'crypto module unavailable'); }
    if (!http || !crypto || !state.runtime.buffer) {
      running = false;
      state.phase = 'unavailable';
      invalidate('required runtime capability unavailable');
      return;
    }
    connect();
  }
  function stop() {
    running = false;
    state.phase = 'stopped';
    clearTransportTimers();
    var conn = active; active = null; dispose(conn);
    invalidate('stopped');
  }
  function fresh(callback) {
    if (typeof callback !== 'function') { return; }
    if (!running || !active || !active.ready || active.failed) {
      try { callback('unknown'); }
      catch (e) { event('callback-error', 'fresh callback failed'); }
      return;
    }
    var waiter = { callback: callback, done: false, timer: null };
    waiter.timer = setTimeout(function () {
      if (!waiter.done) { invalidate('fresh-timeout'); }
    }, 2500);
    waiting.push(waiter);
    queuePump();
  }
  return {
    start: start, stop: stop, fresh: fresh,
    getState: function () { return JSON.parse(JSON.stringify(state)); }
  };
};
