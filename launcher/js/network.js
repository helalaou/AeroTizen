// Top-bar connection indicator: Ethernet, Wi-Fi (with signal strength) or offline.
(function (A) {
  'use strict';

  var tz = A.tizen;
  var ICONS = {
    ethernet: '<path fill="currentColor" d="M8 3h8v4h3v6h-3v3h-2v5h-4v-5H8v-3H5V7h3zm2 2v4H7v2h10V9h-3V5z"/>',
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
    el.innerHTML = kind === 'ethernet' ? ICONS.ethernet : kind === 'offline' ? ICONS.offline : wifi(strength);
    el.setAttribute('aria-label', kind === 'ethernet' ? 'Ethernet' : kind === 'offline' ? 'Offline' : 'Wi-Fi');
    el.classList.toggle('offline', kind === 'offline');
  }

  function refresh() {
    if (!tz || !tz.systeminfo) { return show(navigator.onLine === false ? 'offline' : 'wifi'); }
    try {
      tz.systeminfo.getPropertyValue('NETWORK', function (net) {
        var type = net && net.networkType;
        if (type === 'ETHERNET') { return show('ethernet'); }
        if (type === 'NONE' || !type) { return show('offline'); }
        tz.systeminfo.getPropertyValue('WIFI_NETWORK', function (w) { show('wifi', w && w.signalStrength); },
          function () { show('wifi'); });
      }, function () { show('wifi'); });
    } catch (e) { show('wifi'); }
  }

  A.network = {
    start: function () {
      refresh();
      if (tz && tz.systeminfo) {
        try { tz.systeminfo.addPropertyValueChangeListener('NETWORK', refresh); } catch (e) {}
      }
      setInterval(refresh, 60000);  // Wi-Fi signal drifts without a change event
    }
  };
})(window.AeroTizen);
