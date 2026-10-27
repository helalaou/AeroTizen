// Native Samsung Home and Live TV transitions, adapted from the tested
// AeroTizen handoff. The physical Home-key watcher and service are untouched.
(function (A) {
  'use strict';
  if (!A || !A.homewatch) { return; }

  var tz = A.tizen, cfg = A.config;
  var homePending = false, livePending = false;

  function rearmWatcher() {
    if (!tz) { return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', cfg.SERVICE_URL + '/home', true);
      xhr.timeout = 1500;
      xhr.send();
    } catch (ignored) { /* Existing visibility reporting also rearms. */ }
  }

  // Explicit Samsung Home escape waits for /leave before opening the native UI.
  // Otherwise HomeWatcher may immediately reclaim the launcher.
  function leaveBeforeLaunch(onReady, onFailure) {
    var xhr, settled = false;
    function fail(reason) {
      if (settled) { return; }
      settled = true;
      // The caller owns the rearm and user-facing failure report.
      onFailure(reason);
    }
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', cfg.SERVICE_URL + '/leave', true);
      xhr.timeout = 1500;
      xhr.onload = function () {
        if (settled) { return; }
        if (xhr.status < 200 || xhr.status >= 300) {
          fail('HomeWatcher HTTP ' + xhr.status);
          return;
        }
        settled = true;
        onReady();
      };
      xhr.onerror = xhr.ontimeout = function () { fail('HomeWatcher unavailable'); };
      xhr.send();
    } catch (error) { fail('HomeWatcher request failed'); }
  }

  // Use the same acknowledged /leave handoff as the hardware-tested V992.56.
  // The upstream watcher remains paused until AeroTizen regains foreground;
  // its existing visibility handler then re-arms /home. This deliberately
  // avoids changes to the Frame Art Mode or physical-HOME watcher code.

  function openSamsungHome() {
    if (homePending) { return; }
    if (!tz || !tz.application || !tz.ApplicationControl) {
      A.toast('Samsung Home is unavailable on this device');
      return;
    }
    homePending = true;
    function failed(reason) {
      homePending = false;
      rearmWatcher();
      A.toast('Could not open Samsung Home: ' + reason);
    }
    function succeeded() {
      homePending = false;
      // Leave HomeWatcher paused while native Samsung Home is visible.
    }
    function controlFallback() {
      try {
        tz.application.launchAppControl(
          new tz.ApplicationControl('http://tizen.org/appcontrol/operation/main'),
          'com.samsung.tv.csfs',
          succeeded,
          function (error) { failed((error && (error.name || error.message)) || 'launch denied'); }
        );
      } catch (error) {
        failed((error && (error.name || error.message)) || 'AppControl failed');
      }
    }
    function nativeLaunch() {
      try {
        tz.application.launch('com.samsung.tv.csfs', succeeded, controlFallback);
      } catch (error) { controlFallback(); }
    }
    leaveBeforeLaunch(nativeLaunch, failed);
  }

  // Unlike tvwindow's embedded TV picture, the native viewer owns
  // channel selection and remote-control interactions.
  function openNativeLiveTV(videoSource) {
    if (livePending) { return true; }
    if (!tz || !tz.application || typeof tz.application.launch !== 'function') {
      // Older devices keep the upstream embedded TVWindow behaviour.
      return false;
    }
    livePending = true;
    var finished = false;
    function failed(reason) {
      if (finished) { return; }
      finished = true;
      livePending = false;
      rearmWatcher();
      A.toast('Could not open Live TV: ' + reason);
    }
    function accepted() {
      if (finished) { return; }
      finished = true;
      livePending = false;
      // A Tizen launch success callback only confirms that launch was
      // accepted. It does not guarantee the native viewer took focus.
      window.setTimeout(function () {
        if (!document.hidden) {
          rearmWatcher();
          A.toast('Live TV did not take focus');
        }
      }, 2100);
    }
    function appControlFallback() {
      if (finished) { return; }
      if (!tz.ApplicationControl || !tz.application.launchAppControl) {
        failed('AppControl is unavailable');
        return;
      }
      try {
        tz.application.launchAppControl(
          new tz.ApplicationControl('http://tizen.org/appcontrol/operation/main'),
          'org.tizen.tv-viewer',
          accepted,
          function (error) {
            failed((error && (error.name || error.message)) || 'launch denied');
          }
        );
      } catch (error) { failed((error && (error.name || error.message)) || 'AppControl failed'); }
    }
    function launchViewer() {
      try {
        tz.application.launch('org.tizen.tv-viewer', accepted, appControlFallback);
      } catch (error) { appControlFallback(); }
    }
    function selectTuner() {
      // A previous HDMI selection must not carry over into native Live TV.
      if (!videoSource || !tz.tvwindow || !tz.tvwindow.setSource) {
        launchViewer();
        return;
      }
      try {
        tz.tvwindow.setSource(videoSource, launchViewer, function (error) {
          failed('TV tuner selection failed: ' +
            ((error && (error.name || error.message)) || 'source error'));
        }, 'MAIN');
      } catch (error) { failed('TV tuner selection is unavailable'); }
    }
    leaveBeforeLaunch(selectTuner, failed);
    return true;
  }

  // YouTube/Cobalt also needs an acknowledged /leave to avoid premature
  // HOME relaunch when its Samsung status never reports visible=true.
  A.homewatch.resume = rearmWatcher;
  A.homewatch.suspendForExternal = leaveBeforeLaunch;
  A.homewatch.openSamsungHome = openSamsungHome;
  A.homewatch.openNativeLiveTV = openNativeLiveTV;

  // Ported from the working launcher: returning from a Samsung system app
  // can reload the page without a visibilitychange event. The existing
  // upstream service must then leave its paused /leave state.
  if (window.addEventListener) {
    window.addEventListener('load', rearmWatcher);
  }
})(window.AeroTizen);
