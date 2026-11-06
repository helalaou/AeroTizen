// Top-bar connection indicator: Ethernet, Wi-Fi (with signal strength) or offline.
(function (A) {
  "use strict";

  var tz = A.tizen,
    started = false,
    serial = 0;
  var listeners = [],
    snapshot = null,
    kind = "unknown",
    strength = null;
  function getSnapshot() {
    var visible = A.settings.showNetwork !== false;
    if (!snapshot || snapshot.kind !== kind || snapshot.strength !== strength || snapshot.visible !== visible) {
      snapshot = Object.freeze({ kind: kind, strength: strength, visible: visible });
    }
    return snapshot;
  }
  function publish() {
    getSnapshot();
    listeners.slice().forEach(function (listener) {
      listener();
    });
  }
  function show(nextKind, nextStrength) {
    kind = nextKind;
    strength = nextStrength === undefined ? null : nextStrength;
    publish();
  }

  function refresh() {
    var request = ++serial;
    function unknown() {
      if (request === serial) {
        show(navigator.onLine === false ? "offline" : "unknown");
      }
    }
    if (!tz || !tz.systeminfo) {
      return unknown();
    }
    try {
      tz.systeminfo.getPropertyValue(
        "NETWORK",
        function (net) {
          if (request !== serial) {
            return;
          }
          var type = net && net.networkType;
          if (type === "ETHERNET") {
            return show("ethernet");
          }
          if (type === "NONE") {
            return show("offline");
          }
          if (type !== "WIFI") {
            return unknown();
          }
          // Samsung exposes discrete levels 1..5 on supported televisions.
          // Keep the standard 0..1 Tizen signal as a capability fallback.
          try {
            var network = window.webapis && window.webapis.network;
            var level = network && network.getWiFiSignalStrengthLevel && network.getWiFiSignalStrengthLevel();
            if (
              typeof level === "number" &&
              isFinite(level) &&
              Math.floor(level) === level &&
              level >= 1 &&
              level <= 5
            ) {
              return show("wifi", level >= 4 ? 1 : level >= 2 ? 0.5 : 0.2);
            }
          } catch (ignored) {
            /* Unsupported or denied: try the standard API. */
          }
          try {
            tz.systeminfo.getPropertyValue(
              "WIFI_NETWORK",
              function (w) {
                if (request !== serial) {
                  return;
                }
                var strength = w && w.signalStrength;
                show(
                  "wifi",
                  typeof strength === "number" && isFinite(strength) && strength >= 0 && strength <= 1
                    ? strength
                    : undefined
                );
              },
              function () {
                if (request === serial) {
                  show("wifi");
                }
              }
            );
          } catch (ignored) {
            if (request === serial) {
              show("wifi");
            }
          }
        },
        unknown
      );
    } catch (e) {
      unknown();
    }
  }

  A.network = {
    getSnapshot: getSnapshot,
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    updateVisibility: publish,
    refresh: refresh,
    start: function () {
      if (started) {
        return;
      }
      started = true;
      publish();
      refresh();
      if (tz && tz.systeminfo) {
        try {
          tz.systeminfo.addPropertyValueChangeListener("NETWORK", refresh);
        } catch (e) {}
      }
      setInterval(refresh, 60000); // Wi-Fi signal drifts without a change event
    },
  };
})(window.AeroTizen);
