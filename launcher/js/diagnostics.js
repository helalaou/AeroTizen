/* global module */
// Bounded diagnostics shared by the UI and service. No console interception or app payloads.
(function (root) {
  'use strict';
  var LIMIT = 200, MAX_CHARACTERS = 60000, BATCH_SIZE = 24, MAX_BATCH_CHARACTERS = 4000;
  var fields = ['action', 'mode', 'operation', 'app_id', 'error', 'reason', 'status', 'phase', 'line', 'component', 'transaction', 'version', 'hidden'];
  function clean(value, key) {
    if (typeof value === 'boolean' || typeof value === 'number' && isFinite(value)) { return value; }
    if (key === 'operation') { return /^http:\/\/tizen.org\/appcontrol\/operation\/(main|default|view|service)$/.test(value) ? value : '[other operation]'; }
    return String(value).slice(0, 512)
      .replace(/(password|authkey|secret|token|cookie|duid)\s*[:=]\s*[^\s,]+/gi, '$1=[redacted]')
      .replace(/(?:https?|wss?):\/\/[^\s]+/g, '[url]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[address]')
      .replace(/[A-Za-z]:[\\/][^\n]+|\/(?:Users|home|opt|private|tmp|var)\/[^\n]+/g, '[path]')
      .replace(/\b[a-f0-9]{32,}\b/gi, '[identifier]').slice(0, 192);
  }
  function details(value) {
    var result = {};
    if (value && typeof value === 'object') {
      fields.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(value, key) && ['string', 'number', 'boolean'].indexOf(typeof value[key]) >= 0) {
          result[key] = clean(value[key], key);
        }
      });
    }
    return result;
  }
  function create(source, options) {
    options = options || {};
    var later = options.later || function (fn, ms) { return typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : setTimeout(fn, ms); };
    var records = [], total = 0, store = null, serial = 0;
    var revision = 0, saved = 0, loading = false, saving = false, saveTimer = null;
    var session = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    function scheduleSave(delay) {
      if (!store || loading || saving || saveTimer !== null || revision === saved) { return; }
      saveTimer = later(persist, typeof delay === 'number' ? delay : 500);
      // Optional logs must not hold a Node service open during shutdown.
      if (saveTimer && saveTimer.unref) { saveTimer.unref(); }
    }
    function persist() {
      saveTimer = null;
      if (!store || loading || saving || revision === saved) { return; }
      var target = store, writing = revision, complete = false;
      saving = true;
      function done(error) {
        if (complete) { return; } complete = true; saving = false;
        if (error) { store = null; return; }
        saved = writing; scheduleSave();
      }
      try { target.save(JSON.stringify(records), done); } catch (e) { done(e); }
    }
    function ingest(incoming) {
      if (!Array.isArray(incoming) || incoming.length > LIMIT) { return false; }
      var changed = false;
      incoming.forEach(function (item) {
        if (!item || (item.source !== 'ui' && item.source !== 'service') ||
            typeof item.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(item.id) ||
            typeof item.at !== 'number' || !isFinite(item.at) ||
            typeof item.event !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(item.event)) { return; }
        if (records.some(function (entry) { return entry.id === item.id; })) { return; }
        var entry = { id: item.id, at: item.at, source: item.source, event: item.event, data: details(item.data) };
        records.push(entry); total += JSON.stringify(entry).length; changed = true;
        while (records.length > LIMIT || total > MAX_CHARACTERS) { total -= JSON.stringify(records.shift()).length; }
      });
      if (changed) { revision += 1; scheduleSave(); }
      return true;
    }
    return {
      record: function (name, data) {
        try { ingest([{ id: session + '-' + (++serial), at: Date.now(), source: source, event: name, data: data }]); } catch (e) { /* best effort */ }
      },
      ingest: ingest,
      snapshot: function () { return { schema_version: 1, records: JSON.parse(JSON.stringify(records)) }; },
      flushStorage: function () { scheduleSave(0); },
      attach: function (storage, ready) {
        if (!storage || loading || saving) { return; }
        store = storage; loading = true;
        function loaded(error, value) {
          if (!loading || store !== storage) { return; }
          if (error) { loading = false; store = null; if (ready) { ready(); } return; }
          var recent = records;
          try {
            var previous = value ? JSON.parse(value) : [];
            records = []; total = 0; ingest(previous); ingest(recent);
          } catch (e) { records = recent; total = records.reduce(function (sum, item) { return sum + JSON.stringify(item).length; }, 0); }
          loading = false; revision += 1; scheduleSave();
          if (ready) { ready(); }
        }
        try { storage.load(loaded); } catch (e) { loaded(e); }
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = create; return; }
  var logger = root.AeroDiagnostics = create('ui'), busy = false, sent = {};
  var sendTimer = null;
  var retryTimer = null, retries = 0, retryDelays = [1000, 3000, 10000];
  function cancelRetry() {
    if (retryTimer !== null) { root.clearTimeout(retryTimer); retryTimer = null; }
  }
  function retry() {
    if (root.document.hidden || retryTimer !== null || retries >= retryDelays.length) { return; }
    retryTimer = root.setTimeout(function () { retryTimer = null; flush(); }, retryDelays[retries++]);
  }
  try {
    if (typeof root.AeroDiagnosticsStorage === 'function') {
      root.AeroDiagnosticsStorage(function (storage) { if (storage) { logger.attach(storage, flush); } });
    }
  } catch (e) { /* unavailable async storage keeps an in-memory log */ }
  // Callers only queue work. Snapshot encoding and HTTP sends run in a later task.
  function flush() {
    if (busy || sendTimer !== null || retryTimer !== null || !root.tizen || !root.XMLHttpRequest || root.document.hidden) { return; }
    sendTimer = root.setTimeout(function () { sendTimer = null; send(); }, 0);
  }
  function send() {
    if (busy || root.document.hidden) { return; }
    var batch = [];
    logger.snapshot().records.filter(function (item) { return !sent[item.id]; }).slice(0, BATCH_SIZE).forEach(function (item) {
      if (JSON.stringify(batch.concat([item])).length <= MAX_BATCH_CHARACTERS) { batch.push(item); }
    });
    if (!batch.length) { return; }
    busy = true;
    try {
      var request = new root.XMLHttpRequest();
      request.open('POST', 'http://127.0.0.1:47790/diagnostics/events', true);
      request.setRequestHeader('Content-Type', 'text/plain'); request.timeout = 1500;
      request.onerror = request.ontimeout = function () { busy = false; retry(); };
      request.onload = function () {
        busy = false;
        if (request.status !== 200) { if (request.status >= 500 || request.status === 408) { retry(); } return; }
        // An older service returns 200 for unknown paths. Keep the events queued
        // unless the diagnostics endpoint acknowledges this exact batch.
        var acknowledgement;
        try { acknowledgement = JSON.parse(request.responseText); } catch (e) { return; }
        if (!acknowledgement || acknowledgement.schema_version !== 1 || acknowledgement.accepted !== batch.length) { return; }
        cancelRetry(); retries = 0;
        batch.forEach(function (item) { sent[item.id] = true; });
        var keep = {}; logger.snapshot().records.forEach(function (item) { if (sent[item.id]) { keep[item.id] = true; } }); sent = keep;
        flush();
      };
      request.send(JSON.stringify(batch));
    } catch (e) { busy = false; retry(); }
  }
  logger.flush = flush;
  root.addEventListener('pagehide', function () { logger.flushStorage(); });
  var version = 'unknown';
  try { version = root.tizen.application.getAppInfo().version; } catch (e) { /* desktop or older API */ }
  logger.record('ui.start', { component: 'launcher', version: version });
  root.addEventListener('error', function (event) {
    logger.record('ui.error', { error: event.error && event.error.name || 'ScriptError', line: event.lineno || 0 }); flush();
  });
  root.addEventListener('unhandledrejection', function (event) {
    logger.record('ui.rejection', { error: event.reason && event.reason.name || 'UnhandledRejection' }); flush();
  });
  root.addEventListener('load', function () { logger.record('ui.loaded'); flush(); });
  root.addEventListener('appcontrol', function () {
    var operation = '';
    try { var requested = root.tizen.application.getCurrentApplication().getRequestedAppControl(); operation = requested.appControl.operation; } catch (e) { /* unavailable */ }
    logger.record('ui.appcontrol', { operation: operation }); flush();
  });
  root.document.addEventListener('visibilitychange', function () {
    logger.record('ui.visibility', { hidden: root.document.hidden });
    cancelRetry(); retries = 0;
    if (sendTimer !== null) { root.clearTimeout(sendTimer); sendTimer = null; }
    logger.flushStorage();
    if (!root.document.hidden) { flush(); }
  });
})(typeof window !== 'undefined' ? window : this);
