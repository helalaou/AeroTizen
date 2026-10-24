// Native Samsung system navigation adapted from the TV-tested V992.56.
// The original upstream HomeWatcher service and Frame Art Mode guard are unchanged.
(function (A) {
  'use strict';
  if (!A || !A.homewatch) { return; }

  var cfg = A.config, tz = A.tizen;
  var samsungPending = false, livePending = false, youtubePending = false;

  function rearm() {
    if (!tz) { return; }
    try {
      var req = new XMLHttpRequest();
      req.open('GET', cfg.SERVICE_URL + '/home', true);
      req.timeout = 1500;
      req.send();
    } catch (ignored) { /* Page visibility handling will retry. */ }
  }

  // V992.56 waits for HomeWatcher's /leave ACK before switching to a native
  // Samsung surface. A delayed /leave could otherwise reclaim it immediately.
  function suspendForExternal(ready, failed) {
    if (!tz) { failed('Tizen unavailable'); return; }
    var req = new XMLHttpRequest(), settled = false;
    function reject(reason) {
      if (settled) { return; }
      settled = true;
      rearm(); // A timeout can arrive after /leave took effect.
      failed(reason);
    }
    try {
      req.open('GET', cfg.SERVICE_URL + '/leave', true);
      req.timeout = 1800;
      req.onload = function () {
        if (settled) { return; }
        if (req.status < 200 || req.status >= 300) {
          reject('HomeWatcher HTTP ' + req.status); return;
        }
        settled = true; ready();
      };
      req.onerror = req.ontimeout = function () {
        reject('HomeWatcher unavailable');
      };
      req.send();
    } catch (err) { reject('HomeWatcher request failed'); }
  }

  function launchSystem(id, ok, fail) {
    function fallback() {
      if (!tz.ApplicationControl || !tz.application.launchAppControl) {
        fail('AppControl unavailable'); return;
      }
      try {
        tz.application.launchAppControl(
          new tz.ApplicationControl('http://tizen.org/appcontrol/operation/main'),
          id, ok, function (err) {
            fail((err && (err.name || err.message)) || 'launch denied');
          });
      } catch (err) { fail((err && (err.message || err.name)) || 'AppControl failed'); }
    }
    try {
      tz.application.launch(id, ok, fallback);
    } catch (err) { fallback(); }
  }

  function openSamsungHome() {
    if (samsungPending) { return; }
    if (!tz || !tz.application) {
      A.toast('Samsung Home is unavailable on this device'); return;
    }
    samsungPending = true;
    function fail(reason) {
      samsungPending = false;
      rearm();
      A.toast('Could not open Samsung Home: ' + reason);
    }
    suspendForExternal(function () {
      launchSystem('com.samsung.tv.csfs',
        function () { samsungPending = false; }, fail);
    }, fail);
  }

  function openNativeLiveTV(source) {
    if (livePending) { return; }
    if (!tz || !tz.application) {
      A.toast('Samsung Live TV is unavailable on this device'); return;
    }
    livePending = true;
    var finished = false;
    function fail(reason) {
      if (finished) { return; }
      finished = true; livePending = false;
      rearm();
      A.toast('Could not open Live TV: ' + reason);
    }
    function accepted() {
      if (finished) { return; }
      finished = true; livePending = false;
      // Tizen's success callback is only an accepted request. Preserve
      // V992.56's visibility check and restore tracking if focus never leaves.
      window.setTimeout(function () {
        if (!document.hidden) {
          rearm();
          A.toast('Live TV did not take focus');
        }
      }, 2100);
    }
    function launchViewer() {
      launchSystem('org.tizen.tv-viewer', accepted, fail);
    }
    function tuneThenLaunch() {
      if (!source || !tz.tvwindow || !tz.tvwindow.setSource) {
        launchViewer(); return;
      }
      try {
        tz.tvwindow.setSource(source, launchViewer,
          function (err) {
            fail('TV tuner selection failed: ' +
              ((err && (err.name || err.message)) || 'source error'));
          }, 'MAIN');
      } catch (err) { fail('TV tuner selection unavailable'); }
    }
    suspendForExternal(tuneThenLaunch, fail);
  }

  // Keep the existing legacy escape available for older builds, but the
  // on-screen Samsung Home action uses the native, non-exiting V992.56 route.
  A.homewatch.exitToSamsungHome = A.homewatch.useSamsungHome;
  A.homewatch.useSamsungHome = openSamsungHome;
  A.homewatch.openSamsungHome = openSamsungHome;
  A.homewatch.openNativeLiveTV = openNativeLiveTV;
  A.homewatch.suspendForExternal = suspendForExternal;
  A.homewatch.resume = rearm;

  // Returning from Samsung system apps can reload the page instead of
  // emitting visibilitychange; this is present in the proven V992.56.
  if (window.addEventListener) {
    window.addEventListener('load', rearm);
  }
})(window.AeroTizen);
