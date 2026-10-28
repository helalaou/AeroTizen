'use strict';

// Resolve the package's private persistent directory through the TV API, then
// use Node's atomic rename and fsync before acknowledging a handoff.
var fs = require('fs');
module.exports = function (tz, ready) {
  if (!tz || !tz.filesystem || !tz.filesystem.resolve) { ready(null, false); return; }
  try {
    tz.filesystem.resolve('wgt-private', function (directory) {
      try {
        var uri = directory.toURI();
        if (uri.indexOf('file:///') !== 0) { throw new Error('Private storage URI unavailable'); }
        var folder = decodeURIComponent(uri.slice(7)).replace(/\/$/, '');
        var path = folder + '/aerotizen-home-routing-v1.json';
        var store = {
          exists: function () {
            try { fs.statSync(path); return true; }
            catch (e) { if (e.code === 'ENOENT') { return false; } throw e; }
          },
          getValue: function () {
            if (fs.statSync(path).size > 4096) { throw new Error('Home mode file too large'); }
            return fs.readFileSync(path, 'utf8');
          },
          setValue: function (key, value) {
            if (value.length > 4096) { throw new Error('Home mode value too large'); }
            var temporary = path + '.' + Date.now() + '-' + Math.random().toString(16).slice(2);
            var failure = null;
            try {
              var descriptor = fs.openSync(temporary, 'wx', 384);
              try { fs.writeFileSync(descriptor, value, 'utf8'); fs.fsyncSync(descriptor); }
              finally { fs.closeSync(descriptor); }
              fs.renameSync(temporary, path);
              var parent = fs.openSync(folder, 'r');
              try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
            } catch (e) { failure = e; }
            try { fs.unlinkSync(temporary); } catch (e) { if (e.code !== 'ENOENT' && !failure) { failure = e; } }
            if (failure) { throw failure; }
          }
        };
        ready(store, false);
      } catch (e) { ready(null, true); }
    }, function () { ready(null, true); }, 'rw');
  } catch (e) { ready(null, true); }
};
