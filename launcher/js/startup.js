// Local diagnostic marks only. No app launches, Art checks or polling.
(function (w) {
  'use strict';
  var started = Date.now(), p = w.performance, tick = p && p.now ? p.now() : null;
  var loaded = document.readyState === 'complete', pending = [];
  var trace = { script_at: started, navigation_at: p && p.timing ? p.timing.navigationStart : null, marks: [] };
  function captureLaunch(event) {
    var api = w.tizen && w.tizen.application, launch = {};
    try {
      if (api && api.getCurrentApplication) {
        var request = api.getCurrentApplication().getRequestedAppControl();
        var control = request && request.appControl;
        if (control) {
          launch.operation = String(control.operation || '').slice(0, 96);
          launch.data = {};
          // Record routing flags only. Other payloads can contain private app data.
          (control.data || []).forEach(function (item) {
            if (['entry_point', '__K_BG_LAUNCH', 'init', 'SkipReload'].indexOf(item.key) >= 0 && item.value && item.value.length) {
              launch.data[item.key] = String(item.value[0]).slice(0, 48);
            }
          });
        }
      }
    } catch (e) { launch.error = String(e.name || 'unavailable').slice(0, 32); }
    if (!trace.launch) { trace.launch = launch; }
    else { trace.last_launch = launch; }
    w.AeroStartup.mark(event);
  }
  w.AeroStartup = {
    trace: trace,
    captureLaunch: function () { captureLaunch('launch-request'); },
    afterLoad: function (callback) { if (loaded) { setTimeout(callback, 0); } else { pending.push(callback); } },
    mark: function (name) {
      var elapsed = tick === null ? Date.now() - started : Math.round(p.now() - tick);
      if (trace.marks.length < 32) {
        trace.marks.push({ name: name, ms: elapsed, hidden: document.hidden,
          focused: document.hasFocus ? document.hasFocus() : null });
      }
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
  w.addEventListener('focus', function () { w.AeroStartup.mark('focus'); });
  w.addEventListener('blur', function () { w.AeroStartup.mark('blur'); });
  w.addEventListener('appcontrol', function () { captureLaunch('appcontrol'); });
})(window);
