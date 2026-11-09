// Talks to the background service (service/index.js) that reclaims the screen from
// Samsung Home. Hidden web apps are frozen on retail TVs, so the watching happens there;
// the launcher only reports what it opens and when it's back in front.
(function (A) {
  "use strict";

  var cfg = A.config,
    tz = A.tizen;
  var leaving = false;

  function tell(path, done, failed) {
    if (!tz) {
      return;
    }
    var x = new XMLHttpRequest();
    x.open("GET", cfg.SERVICE_URL + path);
    x.timeout = 1500;
    x.onerror = x.ontimeout = function () {
      if (window.AeroDiagnostics) {
        window.AeroDiagnostics.record("service.unavailable", {
          action: path.split("?")[0],
          error: "RequestFailed",
        });
      }
      (failed || start)();
    };
    x.onload = function () {
      if (x.status !== 200) {
        (failed || start)();
        return;
      }
      if (window.AeroDiagnostics) {
        window.AeroDiagnostics.flush();
      }
      if (done) {
        try {
          done(JSON.parse(x.responseText));
        } catch (e) {
          if (failed) {
            failed();
          }
        }
      }
    };
    x.send();
  }

  function start() {
    if (!tz) {
      return;
    }
    if (window.AeroDiagnostics) {
      window.AeroDiagnostics.record("service.launch_requested");
    }
    try {
      tz.application.launchAppControl(
        new tz.ApplicationControl("http://tizen.org/appcontrol/operation/service"),
        cfg.SERVICE_ID,
        null,
        null
      );
    } catch (e) {
      /* service unavailable: Home simply goes to Samsung's screen */
    }
  }

  // The temporary test screen starts the Tizen 9/10 service without DevTools.
  function ensureService(done, failed) {
    if (!tz) {
      failed("tv_required");
      return;
    }
    var version = 0;
    try {
      version = parseFloat(tz.systeminfo.getCapability("http://tizen.org/feature/platform.version"));
    } catch (e) {
      /* Older TVs use the existing service operation. */
    }
    if (!(version >= 9)) {
      start();
      done();
      return;
    }
    var finished = false;
    var timer;
    function finish(error) {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("aero-native-home-service", loaded);
      if (error) {
        failed("service_start_failed");
      } else {
        done();
      }
    }
    function loaded(event) {
      try {
        var Service = event.detail;
        new Service(cfg.SERVICE_ID).start().then(function () {
          finish(null);
        }, finish);
      } catch (error) {
        finish(error);
      }
    }
    window.addEventListener("aero-native-home-service", loaded);
    timer = setTimeout(function () {
      finish(new Error("Service timeout"));
    }, 5000);
    var script = document.createElement("script");
    script.type = "module";

    script.textContent =
      // eslint-disable-next-line launcher-i18n/translated-copy -- Native module source, not displayed copy.
      "import { Service } from 'wrt:service'; window.dispatchEvent(new CustomEvent('aero-native-home-service', { detail: Service }));";
    script.onerror = function () {
      finish(new Error("Service module unavailable"));
    };
    document.body.appendChild(script);
  }

  A.homewatch = {
    start: start,
    ensureService: ensureService,
    // The launcher is about to open `appId`; Home inside it should come back here.
    watch: function (appId) {
      tell("/watch?id=" + encodeURIComponent(A.catalog.preloadedStoreId(appId) || appId));
    },
    // Every real app, so the service can tell a cast/launch from elsewhere apart from Home.
    reportApps: function (ids) {
      tell("/apps?ids=" + ids.map(encodeURIComponent).join(","));
    },
    // Diagnostic data only; this cannot enable polling or launch an application.
    reportStartup: function (trace) {
      tell("/startup?data=" + encodeURIComponent(JSON.stringify(trace)), null, function () {});
    },
    // Launch Samsung Home explicitly: exiting a native Home app can route back to itself.
    useSamsungHome: function () {
      if (!tz) {
        A.toast(A.translate("handoff.wouldOpenHome"));
        return;
      }
      leaving = true;
      function failed() {
        leaving = false;
        A.toast(A.translate("handoff.homeTryAgain"));
      }
      tell(
        "/leave",
        function (status) {
          if (!status || status.leaving !== true) {
            failed();
            return;
          }
          try {
            tz.application.launch("com.samsung.tv.csfs", null, function () {
              tell("/home");
              failed();
            });
          } catch (e) {
            tell("/home");
            failed();
          }
        },
        failed
      );
    },
    isLeaving: function () {
      return leaving;
    },
  };

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      leaving = false;
      tell("/home");
    }
  });
})(window.AeroTizen);
