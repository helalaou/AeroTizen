'use strict';
var fs = require('fs');
function build(value) {
  value = value || {};
  return {
    version: typeof value.version === 'string' && /^\d+\.\d+\.\d+$/.test(value.version) ? value.version : null,
    build_id: typeof value.build_id === 'string' && /^[a-f0-9]{64}$/.test(value.build_id) ? value.build_id : null,
    commit: typeof value.commit === 'string' && /^[a-f0-9]{40,64}$/.test(value.commit) ? value.commit : null,
    dirty: typeof value.dirty === 'boolean' ? value.dirty : null
  };
}
function health(value) {
  value = value || {}; var result = {};
  ['buffered', 'discarded', 'invalid', 'pending_errors', 'writes', 'write_failures', 'read_failures'].forEach(function (key) {
    if (typeof value[key] === 'number' && isFinite(value[key]) && value[key] >= 0) result[key] = value[key];
  });
  ['unsaved', 'saving'].forEach(function (key) { if (typeof value[key] === 'boolean') result[key] = value[key]; });
  if (['unavailable', 'loading', 'ready', 'saving', 'failed'].indexOf(value.storage) >= 0) result.storage = value.storage;
  if (['monotonic', 'wall_fallback'].indexOf(value.clock) >= 0) result.clock = value.clock;
  if (typeof value.session === 'string' && /^[a-z0-9-]{1,64}$/.test(value.session)) result.session = value.session;
  return result;
}
module.exports = function (options) {
  options = options || {};
  var info = {}, ui = null, started = false;
  try { info = require('../js/build-info'); } catch (e) { /* unbuilt package */ }
  var environment = { state: 'loading', tizen: null, firmware: null,
    arch: typeof process !== 'undefined' ? process.arch : null };
  function read(done) {
    fs.stat('/etc/os-release', function (error, stat) {
      if (error || stat.size > 16384) { done(error || new Error('Metadata size limit')); return; }
      fs.readFile('/etc/os-release', 'utf8', done);
    });
  }
  return {
    start: function () {
      if (started) return; started = true;
      (options.read || read)(function (error, text) {
        environment.state = error ? 'unavailable' : 'collected';
        if (error) { environment.reason = 'os_release_unavailable'; return; }
        String(text).slice(0, 16384).split('\n').forEach(function (line) {
          var match = line.match(/^(VERSION_ID|BUILD_ID)=(.*)$/);
          if (match) environment[match[1] === 'VERSION_ID' ? 'tizen' : 'firmware'] = match[2].replace(/^['"]|['"]$/g, '').slice(0, 128);
        });
        if (!environment.tizen || !environment.firmware) { environment.state = 'partial'; environment.reason = 'os_release_fields_missing'; }
      });
    },
    accept: function (packet) {
      if (!packet || Array.isArray(packet)) return;
      var delivery = packet.delivery || {};
      ui = { reported_at: Date.now(), health: health(packet.health), build: build(packet.build),
        delivery: { state: ['idle', 'acknowledged', 'unavailable', 'rejected'].indexOf(delivery.state) >= 0 ? delivery.state : null,
          retries: typeof delivery.retries === 'number' && delivery.retries >= 0 && delivery.retries <= 3 ? delivery.retries : null,
          last_status: typeof delivery.last_status === 'number' && delivery.last_status >= 100 && delivery.last_status <= 599 ? delivery.last_status : null },
        version: typeof packet.version === 'string' && /^\d+\.\d+\.\d+$/.test(packet.version) ? packet.version : null,
        queued: typeof packet.queued === 'number' && isFinite(packet.queued) && packet.queued >= 0 ? packet.queued : null };
    },
    enrich: function (snapshot, control, state) {
      snapshot.build = build(info); snapshot.environment = environment; snapshot.ui = ui;
      snapshot.context = { mode: control.mode, persistent: control.persistent, protocol: control.protocol,
        watcher_heartbeats: state.heartbeats, watcher_launch_calls: state.guard.launchCalls,
        native_settings: 'not_queried' };
      return snapshot;
    }
  };
};
