// Talks to the background service (service/index.js) that reclaims the screen from
// Samsung Home. Hidden web apps are frozen on retail TVs, so the watching happens there;
// the launcher only reports what it opens and when it's back in front.
(function (A) {
  "use strict";

  var cfg = A.config,
    tz = A.tizen;
  var leaving = false;
  var starting = null;
  var Service = null;
  var inventory = null;
  var transition = 0;
  var homeRequest = 0;
  // A cold boot on Tizen 10 (QN80H) took ~18 s from the wrt:service request to the service's first
  // reply. Waiting less gives up before it answers, and the app inventory is then never restored.
  var START_TIMEOUT = 30000;

  function record(event, data) {
    if (window.AeroDiagnostics) {
      window.AeroDiagnostics.record(event, data);
    }
  }

  function request(path, done, failed, timeout) {
    var settled = false;
    var x;
    function fail() {
      if (!settled) {
        settled = true;
        failed();
      }
    }
    try {
      x = new XMLHttpRequest();
      x.open("GET", cfg.SERVICE_URL + path);
      x.timeout = timeout || 1500;
      x.onerror = x.ontimeout = fail;
      x.onload = function () {
        if (settled) {
          return;
        }
        var value;
        try {
          value = JSON.parse(x.responseText);
        } catch (e) {
          fail();
          return;
        }
        if (x.status !== 200 || !value || typeof value !== "object") {
          fail();
          return;
        }
        settled = true;
        done(value);
      };
      x.send();
    } catch (e) {
      fail();
    }
    return x;
  }

  // Callbacks complete only after the service answers HTTP, never on a launch acknowledgement.
  // One shared attempt bounds concurrent boot, visibility and handoff recovery requests.
  function start(done, failed) {
    if (!tz) {
      if (failed) {
        failed();
      }
      return;
    }
    if (starting) {
      starting.waiters.push({ done: done, failed: failed });
      return;
    }
    var attempt = { waiters: [{ done: done, failed: failed }], launched: false, method: null };
    starting = attempt;
    var timer;
    var pending;
    var script;
    var platformVersion = 0;
    var legacySince = 0;
    var since = Date.now();
    var deadline = setTimeout(function () {
      finish(false, attempt.reason || "service_start_timeout");
    }, START_TIMEOUT);
    function active() {
      return starting === attempt;
    }
    function finish(ready, reason) {
      if (!active()) {
        return;
      }
      starting = null;
      clearTimeout(deadline);
      clearTimeout(timer);
      window.removeEventListener("aero-wrt-service", loaded);
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (pending && pending.abort) {
        pending.abort();
      }
      record(ready ? "service.ready" : "service.start_failed", {
        method: attempt.method,
        duration_ms: Date.now() - since,
        reason: reason,
      });
      attempt.waiters.forEach(function (waiter) {
        var callback = ready ? waiter.done : waiter.failed;
        if (callback) {
          callback();
        }
      });
    }
    function poll() {
      if (!active()) {
        return;
      }
      pending = request(
        "/",
        function (value) {
          if (!active()) {
            return;
          }
          if (
            !value.homeControl ||
            value.homeControl.protocol !== 1 ||
            value.homeControl.app_id !== cfg.APP_ID ||
            typeof value.heartbeats !== "number"
          ) {
            unavailable();
            return;
          }
          // A restarted service loses its app inventory. Restore it before retrying a handoff.
          if (inventory !== null) {
            syncInventory();
          } else {
            finish(true);
          }
        },
        unavailable,
        750
      );
    }
    function syncInventory() {
      var path = inventory;
      pending = request(
        path,
        function () {
          if (!active()) {
            return;
          }
          if (inventory !== path) {
            syncInventory();
          } else {
            finish(true);
          }
        },
        retry,
        750
      );
    }
    function retry() {
      if (active()) {
        timer = setTimeout(poll, 200);
      }
    }
    function unavailable() {
      if (!active()) {
        return;
      }
      if (!attempt.launched) {
        launch();
      } else if (platformVersion >= 9 && attempt.method === "app_control" && Date.now() - legacySince >= 1500) {
        useWrt();
      } else {
        retry();
      }
    }
    function accepted(method) {
      if (active()) {
        record("service.launch_accepted", { method: method });
      }
    }
    function launchWrt() {
      if (!active()) {
        return;
      }
      try {
        var result = new Service(cfg.SERVICE_ID).start();
        if (result && typeof result.then === "function") {
          result.then(
            function () {
              accepted("wrt_service");
            },
            function () {
              attempt.reason = "service_start_rejected";
            }
          );
        }
      } catch (e) {
        attempt.reason = "service_start_rejected";
      }
      // A start can reject because the service is already running. HTTP remains the readiness proof.
      poll();
    }
    function loaded(event) {
      if (!active() || typeof event.detail !== "function") {
        return;
      }
      Service = event.detail;
      window.removeEventListener("aero-wrt-service", loaded);
      launchWrt();
    }
    function useWrt() {
      attempt.method = "wrt_service";
      attempt.reason = null;
      record("service.launch_requested", { method: attempt.method });
      if (Service) {
        launchWrt();
        return;
      }
      window.addEventListener("aero-wrt-service", loaded);
      script = document.createElement("script");
      script.type = "module";
      script.textContent =
        // eslint-disable-next-line launcher-i18n/translated-copy -- Native module source, not displayed copy.
        "import { Service } from 'wrt:service'; window.dispatchEvent(new CustomEvent('aero-wrt-service', { detail: Service }));";
      script.onerror = function () {
        finish(false, "service_module_failed");
      };
      document.body.appendChild(script);
    }
    function launch() {
      attempt.launched = true;
      try {
        platformVersion = parseFloat(tz.systeminfo.getCapability("http://tizen.org/feature/platform.version"));
      } catch (e) {
        /* Keep the existing service operation when the platform version is unavailable. */
      }
      if (platformVersion >= 10) {
        useWrt();
        return;
      }
      // Existing Tizen 9 installs keep AppControl first. Only a missing HTTP reply enables its fallback.
      attempt.method = "app_control";
      legacySince = Date.now();
      record("service.launch_requested", { method: attempt.method });
      try {
        tz.application.launchAppControl(
          new tz.ApplicationControl("http://tizen.org/appcontrol/operation/service"),
          cfg.SERVICE_ID,
          function () {
            accepted("app_control");
          },
          function () {
            attempt.reason = "service_start_rejected";
          }
        );
        poll();
      } catch (e) {
        attempt.reason = "service_start_rejected";
        poll();
      }
    }
    poll();
  }

  function tell(path, done, failed, recover, version) {
    if (!tz) {
      return;
    }
    if (path.indexOf("/apps?ids=") === 0 && path !== inventory) {
      return;
    }
    if (version === undefined && /^\/(home|leave|watch)(\?|$)/.test(path)) {
      version = ++transition;
    }
    function cancelled() {
      if (version === undefined || version === transition) {
        return false;
      }
      // Clear the caller's pending state without treating a newer handoff as an outage.
      if (failed) {
        failed({ name: "AbortError", cancelled: true });
      }
      return true;
    }
    request(
      path,
      function (value) {
        if (cancelled()) {
          return;
        }
        if (window.AeroDiagnostics) {
          window.AeroDiagnostics.flush();
        }
        if (done) {
          done(value);
        }
      },
      function () {
        if (cancelled()) {
          return;
        }
        record("service.unavailable", { action: path.split("?")[0], error: "RequestFailed" });
        if (recover !== false) {
          start(
            function () {
              if (!cancelled()) {
                tell(path, done, failed, false, version);
              }
            },
            function () {
              if (!cancelled() && failed) {
                failed();
              }
            }
          );
        } else if (failed) {
          failed();
        }
      }
    );
  }

  A.homewatch = {
    start: start,
    request: tell,
    // The launcher is about to open `appId`; Home inside it should come back here.
    watch: function (appId, done, failed) {
      var id = A.catalog.preloadedStoreId(appId) || appId;
      tell(
        "/watch?id=" + encodeURIComponent(id),
        function (value) {
          if (done) {
            if (value.watched === id) {
              done();
            } else if (failed) {
              failed();
            }
          }
        },
        failed
      );
    },
    // Every real app, so the service can tell a cast/launch from elsewhere apart from Home.
    reportApps: function (ids) {
      inventory = "/apps?ids=" + ids.map(encodeURIComponent).join(",");
      tell(inventory);
    },
    // Diagnostic data only; this cannot enable polling or launch an application.
    reportStartup: function (trace) {
      tell("/startup?data=" + encodeURIComponent(JSON.stringify(trace)), null, function () {}, false);
    },
    // Launch Samsung Home explicitly: exiting a native Home app can route back to itself.
    useSamsungHome: function () {
      if (!tz) {
        A.toast(A.translate("handoff.wouldOpenHome"));
        return;
      }
      leaving = true;
      var request = ++homeRequest;
      function failed(error) {
        if (request !== homeRequest) {
          return;
        }
        leaving = false;
        if (error && error.cancelled === true) {
          return;
        }
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
