// Boot and key routing. Each layer gets keys in priority order: text entry, fireplace,
// full-screen input, settings, then the home screen.
(function (A) {
  "use strict";

  var KEY = A.config.KEY;

  document.addEventListener("keydown", function (e) {
    var k = e.keyCode,
      active = document.activeElement;
    // Text entry: the on-screen keyboard owns the keys; OK/Done/Back finish.
    if (active && active.tagName === "INPUT") {
      if (k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC || k === KEY.IME_DONE || k === KEY.IME_CANCEL) {
        e.preventDefault();
        active.blur();
        A.settingsUi.focus();
      }
      return;
    }
    if (window.Fireplace.isOpen()) {
      if (k === KEY.UP) {
        window.Fireplace.volumeUp();
      } else if (k === KEY.DOWN) {
        window.Fireplace.volumeDown();
      } else if (k === KEY.BACK || k === KEY.ESC || k === KEY.ENTER) {
        e.preventDefault();
        window.Fireplace.close();
      }
      return;
    }
    if (A.inputs.watching) {
      if (k === KEY.BACK || k === KEY.ESC || k === KEY.ENTER) {
        e.preventDefault();
        A.inputs.leave();
      }
      return;
    }
    if (A.settingsUi.isOpen()) {
      return A.settingsUi.keydown(k, e);
    }
    A.homeScreen.keydown(k, e);
  });

  document.addEventListener("keyup", function (e) {
    if (A.settingsUi.isOpen() || A.inputs.watching || window.Fireplace.isOpen()) {
      return;
    }
    A.homeScreen.keyup(e.keyCode);
  });

  var discoveryStarted = false;
  var appRefreshPending = false;
  function refreshAppsOnReturn() {
    if (!discoveryStarted || !A.tizen || document.hidden || appRefreshPending) {
      return;
    }
    // An existing launcher can receive both events when it comes to the front.
    appRefreshPending = true;
    setTimeout(function () {
      appRefreshPending = false;
      if (!document.hidden) {
        A.apps.load();
      }
    }, 0);
  }

  window.addEventListener("appcontrol", refreshAppsOnReturn);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      A.clock.tick();
      A.inputs.load();
      refreshAppsOnReturn();
    }
  });

  // ---- boot ----------------------------------------------------------------------
  var startup = window.AeroStartup;
  startup.mark("settings-loaded");
  A.applyBackground();
  A.clock.start();
  A.apps.restore();
  A.homeScreen.render();
  startup.mark("home-rendered");

  var appIds;
  var reportAppsTimer;
  function appInventoryChanged() {
    if (!A.settings.getSnapshot().homeInitialized) {
      A.settings.update({ home: A.apps.defaultHome() });
    }
    var nextIds = A.apps.realIds.slice().sort().join(",");
    if (nextIds !== appIds) {
      appIds = nextIds;
      clearTimeout(reportAppsTimer);
      reportAppsTimer = setTimeout(function () {
        A.homewatch.reportApps(A.apps.realIds);
      }, 1500);
    }
  }

  function discover() {
    startup.captureLaunch();
    A.continueWatching.start();
    A.network.start();
    window.Weather.start(function () {
      return A.settings.getSnapshot();
    });
    A.inputs.load();
    A.homewatch.start();
    setTimeout(function () {
      A.homewatch.reportStartup(startup.trace);
    }, 1500);
    startup.mark("apps-requested");
    A.apps.subscribe(appInventoryChanged);
    discoveryStarted = true;
    A.apps.load(function (success) {
      startup.mark(success ? "apps-loaded" : "apps-unavailable");
      if (success) {
        A.homeScreen.refreshApps();
      }
      A.homewatch.reportStartup(startup.trace);
    });
    startup.mark("apps-call-returned");
  }
  // Allow a frame to draw before crossing into the TV's package APIs.
  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      startup.mark("frame-ready");
      startup.afterLoad(discover);
    });
  });
})(window.AeroTizen);
