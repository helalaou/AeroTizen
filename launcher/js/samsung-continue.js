// Samsung's shared Continue Watching feed and application launch data.
(function (A) {
  "use strict";

  var PREFIX = "http://samsung.com/tv/metadata/";
  var ENDPOINT = "http://localhost:9013/?module=EBHelper&func=GetItems";
  var requests = [],
    requestId = 0;

  // Hidden companion services can declare support for their foreground package.
  // Resolve store IDs by exact installed identity; never join on display names.
  function discover(inventory) {
    var groups = Object.create(null),
      found = [];
    inventory.forEach(function (app) {
      var key = app.packageId || app.id;
      if (!groups[key]) {
        groups[key] = { apps: [], supported: false };
      }
      groups[key].apps.push(app);
      try {
        var metadata = A.tizen.application.getAppMetaData(app.id);
        groups[key].supported =
          groups[key].supported ||
          metadata.some(function (entry) {
            return (
              entry &&
              ((entry.key === PREFIX + "app_support_continue_watching" && entry.value === "true") ||
                (entry.key === PREFIX + "use.continue_watching" && entry.value === "bg_service"))
            );
          });
      } catch (e) {
        /* unavailable metadata does not establish support */
      }
    });
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (!group.supported) {
        return;
      }
      var foreground = group.apps.filter(function (app) {
        return app.show !== false && app.name && !A.config.HIDDEN_APPS.test(app.id);
      });
      if (!foreground.length) {
        return;
      }
      foreground.sort(function (a, b) {
        return Number(!!A.catalog.storeId(b.id)) - Number(!!A.catalog.storeId(a.id));
      });
      var app = foreground[0],
        storeId = A.catalog.storeId(app.id);
      found.push({
        id: app.id,
        name: A.tiles.shortName(app.name),
        icon: app.iconPath || "",
        storeId: storeId || "",
        status: storeId ? "Not selected" : "App ID unavailable",
      });
    });
    return found;
  }

  function read(source, done) {
    var xhr = new XMLHttpRequest(),
      settled = false;
    requests.push(xhr);
    function finish(error, records) {
      if (settled) {
        return;
      }
      settled = true;
      var index = requests.indexOf(xhr);
      if (index >= 0) {
        requests.splice(index, 1);
      }
      done(error, records);
    }
    xhr.onload = function () {
      var records;
      try {
        if (xhr.status !== 200 || xhr.responseText.length > 2000000) {
          throw new Error("Unavailable feed");
        }
        records = JSON.parse(xhr.responseText);
      } catch (e) {
        finish(true);
        return;
      }
      finish(!Array.isArray(records), records);
    };
    xhr.onerror =
      xhr.ontimeout =
      xhr.onabort =
        function () {
          finish(true);
        };
    try {
      // app_id alone is not a cache key. Keep each source and retry fresh.
      var key = source.storeId + "-" + Date.now() + "-" + ++requestId;
      xhr.open("GET", ENDPOINT + "&_aerotizen=" + encodeURIComponent(key), true);
      xhr.timeout = 5000;
      xhr.setRequestHeader("app_id", source.storeId);
      xhr.send();
    } catch (e) {
      finish(true);
    }
  }

  function cancel() {
    var pending = requests;
    requests = [];
    pending.forEach(function (xhr) {
      xhr.abort();
    });
  }

  function open(item) {
    try {
      var data = [new A.tizen.ApplicationControlData("PAYLOAD", [JSON.stringify({ values: item.payload })])];
      var control = new A.tizen.ApplicationControl(
        "http://tizen.org/appcontrol/operation/view",
        null,
        null,
        null,
        data
      );
      A.homewatch.watch(item.sourceId);
      A.tizen.application.launchAppControl(control, item.sourceId, null, function () {
        A.toast(A.translate("apps.openFailed", { name: item.title }));
      });
    } catch (e) {
      A.toast(A.translate("apps.openFailed", { name: item.title }));
    }
  }

  A.continueWatching.register({ discover: discover, read: read, open: open, cancel: cancel });
})(window.AeroTizen);
