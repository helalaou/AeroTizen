'use strict';
// Optional async log storage, separate from the durable Home routing receipt.
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
          load: function (done) {
            fs.stat(file, function (error, stat) {
              if (error || stat.size > MAX_BYTES) { done(null, null); return; }
              fs.readFile(file, 'utf8', function (failure, value) {
                done(failure, !failure && Buffer.byteLength(value, 'utf8') <= MAX_BYTES ? value : null);
              });
            });
          },
          save: function (value, done) {
            if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) { done(new Error('Log size limit')); return; }
            var temporary = file + '.tmp';
            function failed(error) { fs.unlink(temporary, function () { done(error); }); }
            fs.writeFile(temporary, value, { encoding: 'utf8', mode: 384 }, function (error) {
              if (error) { failed(error); return; }
              fs.rename(temporary, file, function (failure) {
                if (failure) { failed(failure); } else { done(null); }
              });
            });
          }
        });
      } catch (e) { ready(null); }
    }, function () { ready(null); }, 'rw');
  } catch (e) { ready(null); }
};
