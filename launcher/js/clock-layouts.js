// Classic AeroTizen header and four optional custom clock styles.
// Reuses the existing locale, weather and preference engines; no additional timer or API.
(function (A) {
  'use strict';

  var LAYOUTS = ['classic', 'custom'];
  var STYLES = ['vertical', 'horizontal', 'minimal', 'bold'];
  var widget = document.getElementById('clock-custom-widget');
  var digits = document.getElementById('clock-custom-digits');
  var hours = document.getElementById('clock-custom-hours');
  var minutes = document.getElementById('clock-custom-minutes');
  var period = document.getElementById('clock-custom-period');
  var date = document.getElementById('clock-custom-date');
  var weather = document.getElementById('clock-custom-weather');
  var nativeWeather = document.getElementById('weather');

  function selected(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function update() {
    if (!widget || A.settings.clockLayout !== 'custom') { return; }
    var S = A.settings, now = new Date();
    var showTime = S.showTime !== false, showDate = S.dateFormat !== 'none';
    digits.hidden = !showTime;
    date.hidden = !showDate;
    if (showTime) {
      // Keep the TV's selected 12/24-hour convention and locale digits.
      var formatted = A.clock.formatTime(now, S.timeFormat);
      var parts = /^([^:\uFF1A\u066B]+)[:\uFF1A\u066B]([^\s]+)(.*)$/.exec(formatted);
      hours.textContent = parts ? parts[1].trim() : formatted;
      minutes.textContent = parts ? parts[2] : '';
      period.textContent = parts ? parts[3].trim() : '';
      minutes.hidden = !parts;
      period.hidden = !parts || !parts[3].trim();
    }
    if (showDate) { date.textContent = A.clock.formatDate(now, S.dateFormat); }
    syncWeather();
    widget.hidden = !showTime && !showDate && weather.hidden;
  }

  function syncWeather() {
    if (!widget || !nativeWeather) { return; }
    var show = A.settings.showWeather !== false && !nativeWeather.hidden;
    weather.hidden = !show;
    if (!show) { weather.textContent = ''; return; }
    // Weather remains owned by the upstream renderer. Copy the visible artwork,
    // temperature and optional city rather than issuing separate network calls.
    weather.textContent = '';
    for (var i = 0; i < nativeWeather.childNodes.length; i++) {
      weather.appendChild(nativeWeather.childNodes[i].cloneNode(true));
    }
  }

  function apply() {
    if (!widget) { return; }
    var layout = selected(A.settings.clockLayout, LAYOUTS, 'classic');
    var style = selected(A.settings.aeroClockStyle, STYLES, 'vertical');
    document.body.classList.toggle('clock-custom', layout === 'custom');
    widget.className = 'clock-custom-widget style-' + style;
    widget.hidden = layout !== 'custom';
    update();
  }

  function chooseLayout(layout) {
    A.settings.clockLayout = selected(layout, LAYOUTS, 'classic');
    A.settings.save();
    apply();
  }

  function chooseStyle(style) {
    A.settings.aeroClockStyle = selected(style, STYLES, 'vertical');
    A.settings.save();
    apply();
  }

  A.clockLayouts = {
    LAYOUTS: LAYOUTS,
    STYLES: STYLES,
    apply: apply,
    update: update,
    chooseLayout: chooseLayout,
    chooseStyle: chooseStyle
  };

  if (nativeWeather && window.MutationObserver) {
    var observer = new window.MutationObserver(function () { update(); });
    observer.observe(nativeWeather, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['hidden']
    });
  }
})(window.AeroTizen);
