// Optional authenticated bridge to a read-only, root-owned on-TV reader.
(function (A) {
  "use strict";
  var endpoint = "http://127.0.0.1:47791",
    token = "",
    appId = "",
    generation = 0;
  var pending = [],
    timers = [];

  function cancel() {
    generation++;
    token = "";
    appId = "";
    timers.forEach(clearTimeout);
    timers = [];
    var requests = pending;
    pending = [];
    requests.forEach(function (xhr) {
      xhr.abort();
    });
  }
  function request(method, path, limit, done) {
    var current = generation,
      xhr = new XMLHttpRequest(),
      settled = false;
    pending.push(xhr);
    function finish(error, value) {
      if (settled) {
        return;
      }
      settled = true;
      var index = pending.indexOf(xhr);
      if (index >= 0) {
        pending.splice(index, 1);
      }
      if (current === generation) {
        done(error, value, xhr.status);
      }
    }
    xhr.onload = function () {
      if (method === "POST") {
        finish(xhr.status !== 204);
        return;
      }
      try {
        if (xhr.status !== 200 || xhr.responseText.length > limit) {
          throw new Error("Bridge unavailable");
        }
        finish(false, JSON.parse(xhr.responseText));
      } catch (e) {
        finish(true);
      }
    };
    xhr.onerror =
      xhr.ontimeout =
      xhr.onabort =
        function () {
          finish(true);
        };
    try {
      xhr.open(method, endpoint + path, true);
      xhr.timeout = 1800;
      if (method === "GET") {
        xhr.setRequestHeader("X-AeroTizen-Token", token);
      }
      xhr.send();
    } catch (e) {
      finish(true);
    }
  }
  function credential(done) {
    var current = generation,
      settled = false;
    var timer = setTimeout(function () {
      finish("");
    }, 2000);
    timers.push(timer);
    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      var index = timers.indexOf(timer);
      if (index >= 0) {
        timers.splice(index, 1);
      }
      if (current === generation) {
        done(value);
      }
    }
    try {
      A.tizen.filesystem.resolve(
        "wgt-private/stremio-feed.json",
        function (file) {
          if (settled || current !== generation) {
            return;
          }
          if (!(file.fileSize > 0 && file.fileSize <= 512)) {
            finish("");
            return;
          }
          file.openStream(
            "r",
            function (stream) {
              var value = "";
              try {
                if (!settled && current === generation) {
                  var data = JSON.parse(stream.read(file.fileSize));
                  if (
                    data.schema_version === 1 &&
                    typeof data.token === "string" &&
                    /^[a-f0-9]{64}$/.test(data.token)
                  ) {
                    value = data.token;
                  }
                }
              } catch (e) {
                /* credentials are optional and stay private */
              } finally {
                try {
                  stream.close();
                } catch (e) {
                  value = "";
                }
              }
              finish(value);
            },
            function () {
              finish("");
            },
            "UTF-8"
          );
        },
        function () {
          finish("");
        },
        "r"
      );
    } catch (e) {
      finish("");
    }
  }
  function discover(inventory) {
    return inventory
      .filter(function (app) {
        return app.show !== false && app.id === "IkWsFHtOY9.Stremio";
      })
      .map(function (app) {
        return {
          id: app.id,
          name: A.tiles.shortName(app.name),
          icon: app.iconPath || "",
          storeId: A.catalog.storeId(app.id) || "",
          status: "Not selected",
        };
      });
  }

  function checkAvailability(source, done) {
    if (!A.tizen || !A.tizen.filesystem) {
      done(false);
      return;
    }
    function prepare() {
      request("POST", "/v1/credential", 0, function (error) {
        if (error) {
          done(false);
          return;
        }
        credential(function (secret) {
          check(secret, false);
        });
      });
    }
    function check(secret, canPrepare) {
      if (!secret) {
        if (canPrepare) {
          prepare();
        } else {
          done(false);
        }
        return;
      }
      token = secret;
      request("GET", "/v1/capabilities", 4096, function (error, data, status) {
        if (status === 401 && canPrepare) {
          token = "";
          prepare();
          return;
        }
        if (
          error ||
          !data ||
          data.schema_version !== 1 ||
          data.root !== true ||
          data.stremio_installed !== true ||
          data.stremio_readable !== true ||
          data.stremio_app_id !== source.id
        ) {
          token = "";
          done(false);
          return;
        }
        appId = source.id;
        done(true);
      });
    }
    credential(function (secret) {
      check(secret, true);
    });
  }

  function addArtwork(record) {
    if (!record || typeof record.content_id !== "string" || !/^tt[0-9]{7,12}$/.test(record.content_id)) {
      return;
    }
    // The local library supplies a poster. Metahub provides landscape artwork by IMDb ID.
    var id = record.content_id,
      season = Number.isFinite(record.season) && record.season >= 0 ? record.season : 0;
    record.background_url = "https://images.metahub.space/background/medium/" + id + "/img";
    if (Number.isInteger(season) && Number.isInteger(record.episode) && record.episode > 0) {
      record.thumbnail_url = "https://episodes.metahub.space/" + id + "/" + season + "/" + record.episode + "/w780.jpg";
    }
  }

  function read(source, done) {
    if (!token || source.id !== appId) {
      done(true);
      return;
    }
    request("GET", "/v1/stremio/items", 2000000, function (error, data) {
      if (error || !data || data.schema_version !== 1 || !Array.isArray(data.records)) {
        token = "";
        done(true);
        return;
      }
      var records = data.records.slice(0, 200);
      records.forEach(addArtwork);
      done(false, records);
    });
  }

  A.continueWatching.register({
    discover: discover,
    check: checkAvailability,
    read: read,
    cancel: cancel,
    open: function (item) {
      A.apps.launch({ id: item.sourceId, name: item.sourceName });
    },
  });
})(window.AeroTizen);
