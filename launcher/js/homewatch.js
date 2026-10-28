// Talks to the background service (service/index.js) that reclaims the screen from
// Samsung Home. Hidden web apps are frozen on retail TVs, so the watching happens there;
// the launcher only reports what it opens and when it's back in front.
(function (A) {
  'use strict';

  var cfg = A.config, tz = A.tizen;
  var leaving = false;

  function tell(path, done, failed) {
    if (!tz) { return; }
    var x = new XMLHttpRequest();
    x.open('GET', cfg.SERVICE_URL + path);
    x.timeout = 1500;
    x.onerror = x.ontimeout = failed || start;
    x.onload = function () {
      if (x.status !== 200) { (failed || start)(); return; }
      if (done) {
        try { done(JSON.parse(x.responseText)); } catch (e) { if (failed) { failed(); } }
      }
    };
    x.send();
  }

  function start() {
    if (!tz) { return; }
    try {
      tz.application.launchAppControl(new tz.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
        cfg.SERVICE_ID, null, null);
    } catch (e) { /* service unavailable: Home simply goes to Samsung's screen */ }
  }

  A.homewatch = {
    start: start,
    // The launcher is about to open `appId`; Home inside it should come back here.
    watch: function (appId) { tell('/watch?id=' + encodeURIComponent(A.catalog.preloadedStoreId(appId) || appId)); },
    // Every real app, so the service can tell a cast/launch from elsewhere apart from Home.
    reportApps: function (ids) { tell('/apps?ids=' + ids.map(encodeURIComponent).join(',')); },
    // Diagnostic data only; this cannot enable polling or launch an application.
    reportStartup: function (trace) { tell('/startup?data=' + encodeURIComponent(JSON.stringify(trace)), null, function () {}); },
    // Launch Samsung Home explicitly: exiting a native Home app can route back to itself.
    useSamsungHome: function () {
      if (!tz) { A.toast('Would open Samsung Home'); return; }
      leaving = true;
      function failed() { leaving = false; A.toast('Samsung Home is unavailable. Try again.'); }
      tell('/leave', function (status) {
        if (!status || status.leaving !== true) { failed(); return; }
        try {
          tz.application.launch('com.samsung.tv.csfs', null, function () { tell('/home'); failed(); });
        } catch (e) { tell('/home'); failed(); }
      }, failed);
    },
    isLeaving: function () { return leaving; }
  };

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { leaving = false; tell('/home'); }
  });
})(window.AeroTizen);
