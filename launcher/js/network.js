// Top-bar connection indicator: Ethernet, Wi-Fi (with signal strength) or offline.
(function (A) {
  'use strict';

  var tz = A.tizen, started = false, serial = 0;
  var ICONS = {
    ethernet: '<path fill="currentColor" d="M8 3h8v4h3v6h-3v3h-2v5h-4v-5H8v-3H5V7h3zm2 2v4H7v2h10V9h-3V5z"/>',
    unknown: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3v18" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    offline: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 3.6-2.2M12 7.5a14 14 0 0 1 9 3.6M2 9.1a14 14 0 0 1 3-1.9"/>'
  };

  // Wi-Fi bars: the lit arcs follow signal strength (0..1).
  function wifi(strength) {
    var arcs = ['M12 18.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z', 'M5.6 13.4l1.8 1.8a6.5 6.5 0 0 1 9.2 0l1.8-1.8a9 9 0 0 0-12.8 0z',
                'M2 9.8l1.8 1.8a11.6 11.6 0 0 1 16.4 0L22 9.8a14.1 14.1 0 0 0-20 0z'];
    var lit = strength === undefined ? 3 : strength > 0.66 ? 3 : strength > 0.33 ? 2 : 1;
    // Centre the artwork within the shared 24-unit icon box.
    return '<g transform="translate(0 -2)">' + arcs.map(function (d, i) {
      return '<path fill="currentColor" opacity="' + (i < lit ? 1 : 0.28) + '" d="' + d + '"/>';
    }).join('') + '</g>';
  }

  function show(kind, strength) {
    var el = A.$('network');
    el.innerHTML = kind === 'wifi' ? wifi(strength) : (ICONS[kind] || ICONS.unknown);
    el.setAttribute('data-net-kind', kind);
    el.setAttribute('data-net-level', strength === undefined ? 'unknown' : String(strength));
    var label = kind === 'ethernet' ? 'Ethernet' : kind === 'offline' ? 'Offline' :
      kind === 'wifi' ? (strength === undefined ? 'Wi-Fi (signal unavailable)' : 'Wi-Fi') : 'Network status unavailable';
    el.setAttribute('aria-label', A.i18n ? A.i18n.t(label) : label);
    el.classList.toggle('offline', kind === 'offline');
  }

  function updateVisibility() {
    var el = A.$('network');
    // SVG elements do not expose the HTML hidden property on every TV.
    if (A.settings.showNetwork === false) { el.setAttribute('hidden', ''); }
    else { el.removeAttribute('hidden'); }
  }

  function refresh() {
    var request = ++serial;
    function unknown() {
      if (request === serial) { show(navigator.onLine === false ? 'offline' : 'unknown'); }
    }
    if (!tz || !tz.systeminfo) { return unknown(); }
    try {
      tz.systeminfo.getPropertyValue('NETWORK', function (net) {
        if (request !== serial) { return; }
        var type = net && net.networkType;
        if (type === 'ETHERNET') { return show('ethernet'); }
        if (type === 'NONE') { return show('offline'); }
        if (type !== 'WIFI') { return unknown(); }
        // Samsung exposes discrete levels 1..5 on supported televisions.
        // Keep the standard 0..1 Tizen signal as a capability fallback.
        try {
          var network = window.webapis && window.webapis.network;
          var level = network && network.getWiFiSignalStrengthLevel && network.getWiFiSignalStrengthLevel();
          if (typeof level === 'number' && isFinite(level) && Math.floor(level) === level && level >= 1 && level <= 5) {
            return show('wifi', level >= 4 ? 1 : level >= 2 ? 0.5 : 0.2);
          }
        } catch (ignored) { /* Unsupported or denied: try the standard API. */ }
        try {
          tz.systeminfo.getPropertyValue('WIFI_NETWORK', function (w) {
            if (request !== serial) { return; }
            var strength = w && w.signalStrength;
            show('wifi', typeof strength === 'number' && isFinite(strength) && strength >= 0 && strength <= 1 ? strength : undefined);
          }, function () { if (request === serial) { show('wifi'); } });
        } catch (ignored) { if (request === serial) { show('wifi'); } }
      }, unknown);
    } catch (e) { unknown(); }
  }

  A.network = {
    updateVisibility: updateVisibility,
    refresh: refresh,
    start: function () {
      if (started) { return; }
      started = true;
      updateVisibility();
      refresh();
      if (tz && tz.systeminfo) {
        try { tz.systeminfo.addPropertyValueChangeListener('NETWORK', refresh); } catch (e) {}
      }
      setInterval(refresh, 60000);  // Wi-Fi signal drifts without a change event
    }
  };
})(window.AeroTizen);
