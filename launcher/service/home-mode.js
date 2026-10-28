'use strict';

// Keep a pending handoff disabled across service restarts. Only the native helper
// changes this preference; ordinary launcher /home and /watch events cannot.
var KEY = 'aerotizen.home-routing.v1';
module.exports = function (preference, changed, blocked) {
  var supported = !!(preference && preference.exists && preference.getValue && preference.setValue);
  var saved = { mode: blocked ? 'blocked' : 'watcher', transaction: null, baseline_sha256: null };
  function token(value, length) { return typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$').test(value); }
  function valid(value) {
    return value && (value.mode === 'watcher' ? value.transaction === null && value.baseline_sha256 === null :
      (value.mode === 'native' || value.mode === 'hold') && token(value.transaction, 32) && token(value.baseline_sha256, 64));
  }
  try {
    if (supported && preference.exists(KEY)) {
      saved = JSON.parse(preference.getValue(KEY));
      if (!valid(saved)) { throw new Error('Invalid saved Home mode'); }
    }
  } catch (e) { saved = { mode: 'blocked', transaction: null, baseline_sha256: null }; }
  function read() {
    return { protocol: 1, app_id: 'DclHome001.Home', persistent: supported,
      mode: saved.mode, transaction: saved.transaction, baseline_sha256: saved.baseline_sha256 };
  }
  function change(request) {
    if (!supported) { throw new Error('Persistent Home mode is unavailable'); }
    if (!request || request.expected_mode !== saved.mode || request.expected_transaction !== saved.transaction ||
        request.expected_baseline_sha256 !== saved.baseline_sha256) { throw new Error('Home mode changed; read it again'); }
    var next = { mode: request.mode, transaction: request.transaction, baseline_sha256: request.baseline_sha256 };
    if (!valid(next) || saved.mode === 'blocked' ||
        (next.mode === 'hold' ? (saved.mode !== 'watcher' && next.baseline_sha256 !== saved.baseline_sha256) :
          saved.mode !== 'hold' || (next.mode === 'native' &&
            (next.transaction !== saved.transaction || next.baseline_sha256 !== saved.baseline_sha256)))) {
      throw new Error('Invalid Home handoff transition');
    }
    var encoded = JSON.stringify(next);
    try {
      preference.setValue(KEY, encoded);
      if (preference.getValue(KEY) !== encoded) { throw new Error('Home mode readback failed'); }
      saved = next;
    } catch (e) {
      saved = { mode: 'blocked', transaction: saved.transaction, baseline_sha256: saved.baseline_sha256 };
      changed();
      throw e;
    }
    changed();
    return read();
  }
  return { read: read, change: change };
};
