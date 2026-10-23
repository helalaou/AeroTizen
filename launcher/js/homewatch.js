// Talks to the background service (service/index.js) that reclaims the screen from
// Samsung Home. Hidden web apps are frozen on retail TVs, so the watching happens there;
// the launcher only reports what it opens and when it's back in front.
(function (A) {
  'use strict';

  var cfg = A.config, tz = A.tizen;
  var leaving = false;

  function tell(path) {
    if (!tz) { return; }
    var x = new XMLHttpRequest();
    x.open('GET', cfg.SERVICE_URL + path);
    x.timeout = 1500;
    x.onerror = x.ontimeout = start;  // not running (first boot, crash): start it
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
    // The tucked-away escape: hand the TV back to Samsung Home until the launcher is reopened.
    useSamsungHome: function () {
      leaving = true;
      tell('/leave');
      try { tz.application.getCurrentApplication().exit(); } catch (e) { A.toast('Press Home to open Samsung Home'); }
    },
    isLeaving: function () { return leaving; }
  };

  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tell('/home'); } });
})(window.AeroTizen);
