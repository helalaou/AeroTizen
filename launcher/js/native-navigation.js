// Native Samsung Home and Live TV transitions, adapted from the tested
// AeroTizen handoff. The physical Home-key watcher and service are untouched.
(function (A) {
  "use strict";
  if (!A || !A.homewatch) {
    return;
  }

  var tz = A.tizen,
    cfg = A.config;
  var homePending = false,
    viewerPending = false;

  function report(name, action, operation, reason) {
    var log = window.AeroDiagnostics;
    if (!log) {
      return null;
    }
    var data = { action: action, operation_id: operation };
    if (reason) {
      data.reason = reason;
    }
    var id = log.record("handoff." + name, data);
    if (name !== "request" && log.flush) {
      log.flush();
    }
    return id;
  }

  function rearmWatcher() {
    if (!tz) {
      return;
    }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", cfg.SERVICE_URL + "/home", true);
      xhr.timeout = 1500;
      xhr.send();
    } catch (ignored) {
      /* Existing visibility reporting also rearms. */
    }
  }

  // Read the service's persisted Home routing state without waiting for it to start.
  // Read it for each handoff because the CLI can apply or restore Home at any time.
  function readNativeHome(done) {
    if (!tz || !tz.filesystem || !tz.filesystem.resolve) {
      done(false);
      return;
    }
    var settled = false;
    var timer = window.setTimeout(unavailable, 500);
    function finish(confirmed) {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      done(confirmed);
    }
    function unavailable() {
      finish(false);
    }
    function read(contents) {
      var confirmed = false;
      try {
        var routing = JSON.parse(contents);
        confirmed =
          routing &&
          routing.mode === "native" &&
          typeof routing.transaction === "string" &&
          /^[a-f0-9]{32}$/.test(routing.transaction) &&
          typeof routing.baseline_sha256 === "string" &&
          /^[a-f0-9]{64}$/.test(routing.baseline_sha256);
      } catch (ignored) {
        /* Unreadable routing state keeps the existing handoff. */
      }
      finish(confirmed);
    }
    try {
      tz.filesystem.resolve(
        "wgt-private/aerotizen-home-routing-v1.json",
        function (file) {
          if (settled) {
            return;
          }
          try {
            if (file.fileSize > 0 && file.fileSize <= 4096) {
              file.readAsText(read, unavailable, "UTF-8");
              return;
            }
          } catch (ignored) {
            /* Use the existing handoff if the file cannot be read. */
          }
          unavailable();
        },
        unavailable,
        "r"
      );
    } catch (ignored) {
      unavailable();
    }
  }

  function leaveBeforeLaunch(onReady, onFailure) {
    readNativeHome(function (confirmed) {
      if (confirmed) {
        onReady();
      } else {
        requestLeave(onReady, onFailure);
      }
    });
  }

  // HomeWatcher can reclaim the screen in Watcher mode. Wait for it to pause.
  function requestLeave(onReady, onFailure) {
    var xhr,
      settled = false;
    function fail(reason, detail) {
      if (settled) {
        return;
      }
      settled = true;
      // The caller owns the rearm and user-facing failure report.
      onFailure(reason, detail);
    }
    try {
      xhr = new XMLHttpRequest();
      xhr.open("GET", cfg.SERVICE_URL + "/leave", true);
      xhr.timeout = 1500;
      xhr.onload = function () {
        if (settled) {
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          fail("HomeWatcher HTTP " + xhr.status, A.translate("handoff.watcherHttp", { status: xhr.status }));
          return;
        }
        settled = true;
        onReady();
      };
      xhr.onerror = xhr.ontimeout = function () {
        fail("HomeWatcher unavailable", A.translate("handoff.watcherUnavailable"));
      };
      xhr.send();
    } catch (error) {
      fail("HomeWatcher request failed", A.translate("handoff.watcherRequestFailed"));
    }
  }

  // If the handoff paused the watcher, it stays paused until AeroTizen returns
  // to the foreground. The existing visibility handler then re-arms /home.

  function openSamsungHome() {
    if (homePending) {
      return;
    }
    if (!tz || !tz.application || !tz.ApplicationControl) {
      A.toast(A.translate("handoff.homeUnavailable"));
      return;
    }
    var operation = report("request", "samsung_home");
    homePending = true;
    function failed(reason, detail) {
      homePending = false;
      report("failed", "samsung_home", operation, reason);
      rearmWatcher();
      A.toast(A.translate("handoff.homeFailed", { reason: detail || reason }));
    }
    function succeeded() {
      homePending = false;
      report("accepted", "samsung_home", operation);
    }
    function controlFallback() {
      try {
        tz.application.launchAppControl(
          new tz.ApplicationControl("http://tizen.org/appcontrol/operation/main"),
          "com.samsung.tv.csfs",
          succeeded,
          function (error) {
            var reason = error && (error.name || error.message);
            failed(reason || "launch denied", reason || A.translate("handoff.launchDenied"));
          }
        );
      } catch (error) {
        var reason = error && (error.name || error.message);
        failed(reason || "AppControl failed", reason || A.translate("handoff.appControlFailed"));
      }
    }
    function nativeLaunch() {
      try {
        tz.application.launch("com.samsung.tv.csfs", succeeded, controlFallback);
      } catch (error) {
        controlFallback();
      }
    }
    leaveBeforeLaunch(nativeLaunch, failed);
  }

  // Unlike tvwindow's embedded TV picture, the native viewer owns
  // channel selection and remote-control interactions.
  function openNativeViewer(videoSource, selectHdmi) {
    if (viewerPending) {
      return true;
    }
    if (!tz || !tz.application || typeof tz.application.launch !== "function") {
      // Older devices keep the upstream embedded TVWindow behaviour.
      return false;
    }
    var action = selectHdmi ? "hdmi" : "live_tv";
    var operation = report("request", action);
    viewerPending = true;
    var finished = false;
    function failed(reason, detail) {
      if (finished) {
        return;
      }
      finished = true;
      viewerPending = false;
      report("failed", action, operation, reason);
      rearmWatcher();
      A.toast(
        selectHdmi
          ? A.translate("inputs.switchFailed")
          : A.translate("handoff.liveTvFailed", { reason: detail || reason })
      );
    }
    function accepted() {
      if (finished) {
        return;
      }
      finished = true;
      viewerPending = false;
      report("accepted", action, operation);
      // A Tizen launch success callback only confirms that launch was
      // accepted. It does not guarantee the native viewer took focus.
      window.setTimeout(function () {
        if (!document.hidden) {
          report("visibility_unconfirmed", action, operation);
          rearmWatcher();
          A.toast(selectHdmi ? A.translate("inputs.switchFailed") : A.translate("handoff.liveTvNoFocus"));
        }
      }, 2100);
    }
    function appControlFallback() {
      if (finished) {
        return;
      }
      if (!tz.ApplicationControl || !tz.application.launchAppControl) {
        failed("AppControl is unavailable", A.translate("handoff.appControlUnavailable"));
        return;
      }
      try {
        tz.application.launchAppControl(
          new tz.ApplicationControl("http://tizen.org/appcontrol/operation/main"),
          "org.tizen.tv-viewer",
          accepted,
          function (error) {
            var reason = error && (error.name || error.message);
            failed(reason || "launch denied", reason || A.translate("handoff.launchDenied"));
          }
        );
      } catch (error) {
        var reason = error && (error.name || error.message);
        failed(reason || "AppControl failed", reason || A.translate("handoff.appControlFailed"));
      }
    }
    function launchViewer() {
      try {
        tz.application.launch("org.tizen.tv-viewer", accepted, appControlFallback);
      } catch (error) {
        appControlFallback();
      }
    }
    function selectSource() {
      if (selectHdmi) {
        selectHdmi().then(
          function (success) {
            if (success) {
              launchViewer();
            } else {
              failed("IP Control source selection failed");
            }
          },
          function () {
            failed("IP Control source selection failed");
          }
        );
        return;
      }
      // A previous HDMI selection must not carry over into native Live TV.
      if (!videoSource || !tz.tvwindow || !tz.tvwindow.setSource) {
        launchViewer();
        return;
      }
      try {
        tz.tvwindow.setSource(
          videoSource,
          launchViewer,
          function (error) {
            var reason = error && (error.name || error.message);
            failed(
              "TV tuner selection failed: " + (reason || "source error"),
              A.translate("handoff.tunerFailed", { reason: reason || A.translate("handoff.sourceError") })
            );
          },
          "MAIN"
        );
      } catch (error) {
        failed("TV tuner selection is unavailable", A.translate("handoff.tunerUnavailable"));
      }
    }
    leaveBeforeLaunch(selectSource, failed);
    return true;
  }

  // YouTube/Cobalt needs the Watcher mode handoff when its Samsung status never
  // reports visible=true.
  A.homewatch.resume = rearmWatcher;
  A.homewatch.suspendForExternal = leaveBeforeLaunch;
  A.homewatch.openSamsungHome = openSamsungHome;
  A.homewatch.openNativeLiveTV = openNativeViewer;
  A.homewatch.openNativeHdmi = function (selectHdmi) {
    return openNativeViewer(null, selectHdmi);
  };

  // Ported from the working launcher: returning from a Samsung system app
  // can reload the page without a visibilitychange event. The existing
  // upstream service must then leave its paused /leave state.
  if (window.addEventListener) {
    window.addEventListener("load", rearmWatcher);
  }
})(window.AeroTizen);
