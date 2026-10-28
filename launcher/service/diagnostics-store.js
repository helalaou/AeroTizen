'use strict';
// Optional log storage, deliberately separate from the durable Home routing receipt.
var fs = require('fs');
var MAX_BYTES = 256 * 1024;
module.exports = function (tz, ready) {
  if (!tz || !tz.filesystem || !tz.filesystem.resolve) { ready(null); return; }
  try {
    tz.filesystem.resolve('wgt-private', function (directory) {
      try {
        var uri = directory.toURI();
        if (uri.indexOf('file:///') !== 0) { ready(null); return; }
        var file = decodeURIComponent(uri.slice(7)).replace(/\/$/, '') + '/aerotizen-diagnostics-v1.json';
        ready({
          load: function () {
            try { if (fs.statSync(file).size > MAX_BYTES) { return null; } return fs.readFileSync(file, 'utf8'); }
            catch (e) { return null; }
          },
          save: function (value) {
            if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) { return; }
            var temporary = file + '.tmp', descriptor;
            try {
              descriptor = fs.openSync(temporary, 'w', 384);
              try { fs.writeFileSync(descriptor, value, 'utf8'); } finally { fs.closeSync(descriptor); }
              fs.renameSync(temporary, file);
            } finally { try { fs.unlinkSync(temporary); } catch (e) { /* absent */ } }
          }
        });
      } catch (e) { ready(null); }
    }, function () { ready(null); }, 'rw');
  } catch (e) { ready(null); }
};
