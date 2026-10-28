/* global module */
// Async UI log storage. Existing localStorage logs are read once in an idle task.
(function (root) {
  'use strict';
  function open(host, ready) {
    var request, settled = false;
    function finish(value) { if (!settled) { settled = true; ready(value); } }
    try {
      if (!host.indexedDB) { finish(null); return; }
      request = host.indexedDB.open('aerotizen.diagnostics.v1', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('logs'); };
      request.onerror = request.onblocked = function () { finish(null); };
      request.onsuccess = function () {
        var database = request.result;
        if (settled) { database.close(); return; }
        database.onversionchange = function () { database.close(); };
        finish({
          load: function (done) {
            var transaction, read;
            function legacy() {
              var value = null;
              try { value = host.localStorage.getItem('aerotizen.diagnostics.v1'); } catch (e) { /* optional legacy read */ }
              done(null, typeof value === 'string' && value.length <= 131072 ? value : null);
            }
            try {
              transaction = database.transaction('logs', 'readonly');
              read = transaction.objectStore('logs').get('current');
              transaction.oncomplete = function () {
                if (typeof read.result === 'string' && read.result.length <= 131072) { done(null, read.result); }
                else if (host.requestIdleCallback) { host.requestIdleCallback(legacy, { timeout: 1000 }); }
                else { host.setTimeout(legacy, 0); }
              };
              transaction.onabort = function () { done(transaction.error || new Error('Log read failed')); };
            } catch (e) { done(e); }
          },
          save: function (value, done) {
            try {
              var transaction = database.transaction('logs', 'readwrite');
              transaction.objectStore('logs').put(value, 'current');
              transaction.oncomplete = function () { done(null); };
              transaction.onabort = function () { done(transaction.error || new Error('Log write failed')); };
            } catch (e) { done(e); }
          }
        });
      };
    } catch (e) { finish(null); }
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = open; }
  else { root.AeroDiagnosticsStorage = function (ready) { open(root, ready); }; }
})(typeof window !== 'undefined' ? window : this);
