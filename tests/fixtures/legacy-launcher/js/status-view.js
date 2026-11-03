// Legacy status markup used only by comparison and presentation regression tests.
(function () {
  "use strict";
  var A = window.AeroTizen || {};
  if (A.clock) {
    A.clock.subscribe(function () {
      var date = A.$("date"),
        time = A.$("time"),
        now = new Date(A.clock.getSnapshot());
      date.textContent = A.clock.formatDate(now, A.settings.dateFormat);
      date.hidden = A.settings.dateFormat === "none";
      time.hidden = A.settings.showTime === false;
      time.parentNode.classList.toggle("weather-only", time.hidden && date.hidden);
      time.setAttribute("data-format", A.settings.timeFormat === "24" ? "24" : "12");
      time.textContent = A.clock.formatTime(now, A.settings.timeFormat);
      if (time.style && typeof window.getComputedStyle === "function") {
        var style = window.getComputedStyle(time),
          context = document.createElement("canvas").getContext("2d");
        if (context) {
          var font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
          context.font = font;
          time.style.width =
            A.clock.measureTime(A.settings.timeFormat, font, function (value) {
              return context.measureText(value).width;
            }) + "px";
        }
      }
    });
  }
  if (window.Weather) {
    // WMO weather codes -> simple icon shapes.
    var WEATHER_ICONS = {
      sun: '<circle cx="12" cy="12" r="4.5" fill="#ffd34d"/><g stroke="#ffd34d" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g>',
      partly:
        '<circle cx="9" cy="9" r="3.6" fill="#ffd34d"/><path fill="#e8ecf2" d="M8 19h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 8 19z"/>',
      cloud: '<path fill="#d5dbe4" d="M7 19h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 19z"/>',
      fog: '<g stroke="#c9cfd8" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M6 13h12M4 17h16"/></g>',
      rain: '<path fill="#d5dbe4" d="M7 15h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 15z"/><g stroke="#6cb6ff" stroke-width="1.8" stroke-linecap="round"><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></g>',
      snow: '<path fill="#d5dbe4" d="M7 15h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 15z"/><g fill="#fff"><circle cx="8" cy="19" r="1.2"/><circle cx="12" cy="20.5" r="1.2"/><circle cx="16" cy="19" r="1.2"/></g>',
      storm:
        '<path fill="#b9c0cc" d="M7 14h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 14z"/><path fill="#ffd34d" d="M12.5 13l-3 5h2.5l-1.5 4.5 4.5-6h-2.6l1.6-3.5z"/>',
    };
    function icon(code) {
      if (code === 0 || code === 1) {
        return WEATHER_ICONS.sun;
      }
      if (code === 2) {
        return WEATHER_ICONS.partly;
      }
      if (code === 3) {
        return WEATHER_ICONS.cloud;
      }
      if (code === 45 || code === 48) {
        return WEATHER_ICONS.fog;
      }
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        return WEATHER_ICONS.snow;
      }
      if (code >= 95) {
        return WEATHER_ICONS.storm;
      }
      if (code >= 51) {
        return WEATHER_ICONS.rain;
      }
      return WEATHER_ICONS.cloud;
    }

    window.Weather.subscribe(function () {
      var value = window.Weather.getSnapshot(),
        el = document.getElementById("weather");
      if (!el) {
        return;
      }
      if (!value.visible) {
        el.textContent = "";
        el.hidden = true;
        return;
      }
      el.innerHTML =
        '<svg viewBox="0 0 24 24">' + icon(value.code) + "</svg><b></b>" + (value.showLocation ? "<span></span>" : "");
      el.querySelector("b").textContent = Math.round(value.temperature) + "°";
      if (value.showLocation) {
        el.querySelector("span").textContent = value.city;
      }
      el.hidden = false;
    });
  }
  if (A.network) {
    var ICONS = {
      ethernet: '<path fill="currentColor" d="M8 3h8v4h3v6h-3v3h-2v5h-4v-5H8v-3H5V7h3zm2 2v4H7v2h10V9h-3V5z"/>',
      unknown:
        '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3v18" fill="none" stroke="currentColor" stroke-width="1.5"/>',
      offline:
        '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 3.6-2.2M12 7.5a14 14 0 0 1 9 3.6M2 9.1a14 14 0 0 1 3-1.9"/>',
    };

    // Wi-Fi bars: the lit arcs follow signal strength (0..1).
    function wifi(strength) {
      var arcs = [
        "M12 18.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z",
        "M5.6 13.4l1.8 1.8a6.5 6.5 0 0 1 9.2 0l1.8-1.8a9 9 0 0 0-12.8 0z",
        "M2 9.8l1.8 1.8a11.6 11.6 0 0 1 16.4 0L22 9.8a14.1 14.1 0 0 0-20 0z",
      ];
      var lit = strength === undefined ? 3 : strength > 0.66 ? 3 : strength > 0.33 ? 2 : 1;
      // Centre the artwork within the shared 24-unit icon box.
      return (
        '<g transform="translate(0 -2)">' +
        arcs
          .map(function (d, i) {
            return '<path fill="currentColor" opacity="' + (i < lit ? 1 : 0.28) + '" d="' + d + '"/>';
          })
          .join("") +
        "</g>"
      );
    }

    A.network.subscribe(function () {
      var value = A.network.getSnapshot(),
        el = A.$("network");
      el.innerHTML =
        value.kind === "wifi"
          ? wifi(value.strength === null ? undefined : value.strength)
          : ICONS[value.kind] || ICONS.unknown;
      el.setAttribute("data-net-kind", value.kind);
      el.setAttribute("data-net-level", value.strength === null ? "unknown" : String(value.strength));
      var label =
        value.kind === "ethernet"
          ? "Ethernet"
          : value.kind === "offline"
            ? "Offline"
            : value.kind === "wifi"
              ? value.strength === null
                ? "Wi-Fi (signal unavailable)"
                : "Wi-Fi"
              : "Network status unavailable";
      el.setAttribute("aria-label", A.i18n ? A.i18n.t(label) : label);
      el.classList.toggle("offline", value.kind === "offline");
      if (value.visible) {
        el.removeAttribute("hidden");
      } else {
        el.setAttribute("hidden", "");
      }
    });
  }
})();
