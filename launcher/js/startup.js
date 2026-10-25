// Local diagnostic marks only. No app launches, Art checks or polling.
(function (w) {
  'use strict';
  var started = Date.now(), p = w.performance, tick = p && p.now ? p.now() : null;
  var loaded = document.readyState === 'complete', pending = [];
  var trace = { script_at: started, navigation_at: p && p.timing ? p.timing.navigationStart : null, marks: [] };
  w.AeroStartup = {
    trace: trace,
    afterLoad: function (callback) { if (loaded) { setTimeout(callback, 0); } else { pending.push(callback); } },
    mark: function (name) {
      var elapsed = tick === null ? Date.now() - started : Math.round(p.now() - tick);
      if (trace.marks.length < 32) { trace.marks.push({ name: name, ms: elapsed, hidden: document.hidden }); }
      try { localStorage.setItem('aerotizen.startup.v1', JSON.stringify(trace)); } catch (e) { /* diagnostics are optional */ }
    }
  };
  w.AeroStartup.mark('first-script');
  document.addEventListener('DOMContentLoaded', function () { w.AeroStartup.mark('dom-ready'); });
  w.addEventListener('load', function () {
    w.AeroStartup.mark('page-loaded'); loaded = true;
    pending.forEach(function (callback) { setTimeout(callback, 0); }); pending = [];
  });
  document.addEventListener('visibilitychange', function () { w.AeroStartup.mark(document.hidden ? 'hidden' : 'visible'); });
})(window);
