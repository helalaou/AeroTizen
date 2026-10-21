// Boot and key routing. Each layer gets keys in priority order: text entry, fireplace,
// full-screen input, settings, then the home screen.
(function (A) {
  'use strict';

  var KEY = A.config.KEY;

  A.applyBackground = function () {
    window.Backgrounds.setSpeed(A.settings.speed);
    window.Backgrounds.apply(A.settings.background);
  };

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode, active = document.activeElement;
    // Text entry: the on-screen keyboard owns the keys; OK/Done/Back finish.
    if (active && active.tagName === 'INPUT') {
      if (k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC || k === KEY.IME_DONE || k === KEY.IME_CANCEL) {
        e.preventDefault(); active.blur(); A.settingsUi.focus();
      }
      return;
    }
    if (window.Fireplace.isOpen()) {
      if (k === KEY.UP) { window.Fireplace.volumeUp(); } else if (k === KEY.DOWN) { window.Fireplace.volumeDown(); } else if (k === KEY.BACK || k === KEY.ESC || k === KEY.ENTER) { e.preventDefault(); window.Fireplace.close(); }
      return;
    }
    if (A.inputs.watching) {
      if (k === KEY.BACK || k === KEY.ESC || k === KEY.ENTER) { e.preventDefault(); A.inputs.leave(); }
      return;
    }
    if (A.settingsUi.isOpen()) { return A.settingsUi.keydown(k, e); }
    A.homeScreen.keydown(k, e);
  });

  document.addEventListener('keyup', function (e) {
    if (A.settingsUi.isOpen() || A.inputs.watching || window.Fireplace.isOpen()) { return; }
    A.homeScreen.keyup(e.keyCode);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { A.clock.tick(); A.inputs.load(); }
  });

  // ---- boot ----------------------------------------------------------------------
  A.settings.load();
  A.applyBackground();
  A.clock.start();
  A.network.start();
  window.Weather.start(function () { return A.settings; });
  A.apps.load(function () {
    if (!A.settings.home.length) { A.settings.home = A.apps.defaultHome(); A.settings.save(); }
    A.homeScreen.render();
    A.inputs.load();
    A.homewatch.start();
    setTimeout(function () { A.homewatch.reportApps(A.apps.realIds); }, 1500);
  });
})(window.AeroTizen);
