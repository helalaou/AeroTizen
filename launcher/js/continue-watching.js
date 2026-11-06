// Shared Continue Watching state and feed lifecycle.
(function (A) {
  "use strict";

  var cw = (A.continueWatching = { sources: [], items: [], messageKey: "" });
  var listeners = [],
    providers = [],
    timers = [],
    generation = 0,
    started = false,
    signature = "";
  var feeds = Object.create(null),
    candidates = Object.create(null),
    startupUntil = 0,
    clockWall = 0,
    clockElapsed = 0;
  var CLOCK_CHANGE_MS = 1000;
  var STARTUP_RETRIES = [2000, 5000, 15000, 30000, 60000, 60000, 60000, 60000],
    REFRESH_RETRIES = [2000, 2000];

  // A cold TV can correct its date after launch. Retry limits use elapsed time.
  function retryTime() {
    return window.performance && window.performance.now ? window.performance.now() : Date.now();
  }

  cw.subscribe = function (listener) {
    listeners.push(listener);
    return function () {
      var i = listeners.indexOf(listener);
      if (i >= 0) {
        listeners.splice(i, 1);
      }
    };
  };
  function publish() {
    listeners.slice().forEach(function (listener) {
      listener();
    });
  }
  function later(fn, delay) {
    var timer = setTimeout(function () {
      var i = timers.indexOf(timer);
      if (i >= 0) {
        timers.splice(i, 1);
      }
      fn();
    }, delay);
    timers.push(timer);
  }
  function cancel() {
    generation++;
    timers.forEach(clearTimeout);
    timers = [];
    providers.forEach(function (provider) {
      provider.cancel();
    });
  }

  // Adapters discover installed candidates, read records, and open cards.
  // Adapters with a readiness check retry that check during startup and hide on read failure.
  cw.register = function (provider) {
    providers.push(provider);
  };

  function discover(inventory) {
    var found = Object.create(null);
    providers.forEach(function (provider) {
      provider.discover(inventory).forEach(function (source) {
        // An earlier adapter can claim an app even while its feed is unavailable.
        if (!found[source.id]) {
          found[source.id] = { source: source, provider: provider };
        }
      });
    });
    return found;
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name);
  }

  function text(value, limit) {
    return typeof value === "string" ? value.slice(0, limit) : "";
  }
  function imageUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value) ? text(value, 4000) : "";
  }
  function nonnegative(value) {
    return typeof value === "number" && isFinite(value) && value >= 0 ? value : 0;
  }
  function activity(value) {
    value = nonnegative(value);
    if (value > 100000000000) {
      value /= 1000;
    }
    // Reject invalid/future values; never substitute expiry, release or fetch time.
    return value > 0 && value <= Date.now() / 1000 + 86400 ? value : 0;
  }
  cw.normalize = function (source, records) {
    if (!Array.isArray(records)) {
      throw new Error("Invalid feed");
    }
    var byId = Object.create(null),
      result = [];
    records.slice(0, 200).forEach(function (record) {
      var storeId = record && record.app_id;
      if (!record || (typeof storeId === "number" ? String(storeId) : storeId) !== source.storeId) {
        return;
      }
      var title = text(record.content_title, 300),
        id = text(record.content_id, 500),
        payload = text(record.payload, 16000);
      if (!title || !id || !payload || record.content_id.length > 500 || record.payload.length > 16000) {
        return;
      }
      var item = {
        key: source.id + ":" + id,
        sourceId: source.id,
        sourceName: source.name,
        sourceIcon: source.icon || "",
        title: title,
        season: nonnegative(record.season),
        episode: nonnegative(record.episode),
        payload: payload,
        duration: nonnegative(record.duration),
        playback: nonnegative(record.playback),
        timestamp: activity(record.timestamp),
        image: imageUrl(record.image_url),
      };
      var thumbnail = imageUrl(record.thumbnail_url),
        background = imageUrl(record.background_url);
      if (thumbnail) {
        item.thumbnailImage = thumbnail;
      }
      if (background) {
        item.backgroundImage = background;
      }
      var previous = byId[id];
      if (!previous) {
        byId[id] = item;
        result.push(item);
      } else if (item.timestamp > previous.timestamp) {
        result[result.indexOf(previous)] = item;
        byId[id] = item;
      }
    });
    // Zero-offset next episodes remain eligible. Old expiry dates are unreliable
    // on tested providers. Distinct episode IDs must not be merged by title.
    return result;
  };
  function merge() {
    var items = [],
      previous = Object.create(null);
    cw.items.forEach(function (item) {
      previous[item.key] = item;
    });
    // Retain bounded source records so a clock correction can revalidate dates.
    cw.sources.forEach(function (source) {
      items = items.concat(cw.normalize(source, feeds[source.id] || []));
    });
    items = items
      .map(function (item, index) {
        return { item: item, index: index };
      })
      .sort(function (a, b) {
        return b.item.timestamp - a.item.timestamp || a.index - b.index;
      })
      .slice(0, 30)
      .map(function (entry) {
        var item = entry.item,
          old = previous[item.key];
        return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
      });
    // Status updates and identical reads must not reload card artwork.
    if (
      items.length !== cw.items.length ||
      items.some(function (item, index) {
        return item !== cw.items[index];
      })
    ) {
      cw.items = items;
    }
    publish();
  }
  function checkClock() {
    var wall = Date.now(),
      elapsed = retryTime();
    var changed = Math.abs(wall - clockWall - (elapsed - clockElapsed)) > CLOCK_CHANGE_MS;
    clockWall = wall;
    clockElapsed = elapsed;
    if (changed && cw.items.length && A.settings.getSnapshot().continueWatching === true && !document.hidden) {
      merge();
    }
  }
  function updateMessage() {
    cw.messageKey = !A.apps.ready ? "continue.findingApps" : !cw.sources.length ? "continue.noApps" : "";
  }
  function isSelected(source) {
    return !!source.storeId && A.settings.getSnapshot().continueWatchingApps.indexOf(source.id) >= 0;
  }

  function remove(source) {
    cw.sources = cw.sources.filter(function (entry) {
      return entry !== source;
    });
    delete feeds[source.id];
    updateMessage();
    merge();
  }

  // A cold TV can start its feeds late. All startup retries share one deadline.
  function retry(attempt, warmup, fn) {
    var delays = warmup ? STARTUP_RETRIES : REFRESH_RETRIES,
      remaining = warmup ? startupUntil - retryTime() : Infinity;
    if (attempt >= delays.length || remaining <= 0) {
      return false;
    }
    later(fn, Math.min(delays[attempt], remaining));
    return true;
  }

  function check(candidate, token, attempt) {
    if (token !== generation) {
      return;
    }
    var source = candidate.source;
    candidate.provider.check(source, function (available) {
      if (token !== generation) {
        return;
      }
      var visible = cw.sources.indexOf(source) >= 0;
      if (!available) {
        if (visible) {
          remove(source);
        }
        retry(attempt, true, function () {
          check(candidate, token, attempt + 1);
        });
        return;
      }
      if (!visible) {
        cw.sources.push(source);
        cw.sources.sort(byName);
        updateMessage();
      }
      if (!isSelected(source)) {
        if (!visible) {
          merge();
        }
        return;
      }
      source.status = "Checking for items";
      publish();
      read(candidate, token, 0, false);
    });
  }

  function read(candidate, token, attempt, warmup) {
    if (token !== generation) {
      return;
    }
    var source = candidate.source,
      checked = !!candidate.provider.check;
    candidate.provider.read(source, function (error, records) {
      if (token !== generation) {
        return;
      }
      var count = 0;
      if (!error) {
        count = checked ? records.length : cw.normalize(source, records).length;
      }
      // Checked feeds retry readiness. An empty history is a valid result.
      if (
        !checked &&
        (error ? warmup : !count) &&
        retry(attempt, warmup, function () {
          read(candidate, token, attempt + 1, warmup);
        })
      ) {
        source.status = "Checking for items";
        publish();
        return;
      }
      if (error && checked) {
        remove(source);
        return;
      }
      feeds[source.id] = error ? [] : records.slice(0, 200);
      if (error) {
        source.status = "Unavailable";
      } else if (!count) {
        source.status = "No items available";
      } else {
        source.status = checked ? "Available" : count + (count === 1 ? " item" : " items");
      }
      merge();
    });
  }

  cw.refresh = function (choicesChanged) {
    var previous = cw.sources;
    cancel();
    candidates = Object.create(null);
    cw.sources = [];
    cw.messageKey = "";
    if (A.settings.getSnapshot().continueWatching !== true) {
      feeds = Object.create(null);
      cw.items = [];
      publish();
      return;
    }
    if (!A.tizen || !A.tizen.application || !A.tizen.application.getAppMetaData) {
      feeds = Object.create(null);
      cw.items = [];
      cw.messageKey = "continue.tvOnly";
      publish();
      return;
    }
    candidates = discover(A.apps.inventory || []);
    var token = generation,
      discovered = Object.keys(candidates).map(function (id) {
        return candidates[id];
      });
    discovered.forEach(function (candidate) {
      var source = candidate.source;
      if (
        !candidate.provider.check ||
        previous.some(function (entry) {
          return entry.id === source.id;
        })
      ) {
        if (isSelected(source)) {
          source.status = "Checking for items";
        }
        cw.sources.push(source);
      }
    });
    cw.sources.sort(byName);
    updateMessage();
    Object.keys(feeds).forEach(function (id) {
      if (!candidates[id] || !isSelected(candidates[id].source)) {
        delete feeds[id];
      }
    });
    merge();
    if (!document.hidden) {
      var warmup = retryTime() < startupUntil;
      // Keep an unchecked, verified source available without another request.
      discovered.forEach(function (candidate) {
        var source = candidate.source;
        if (candidate.provider.check) {
          if (choicesChanged !== true || isSelected(source) || cw.sources.indexOf(source) < 0) {
            check(candidate, token, 0);
          }
        } else if (isSelected(source)) {
          read(candidate, token, 0, warmup);
        }
      });
    }
  };

  cw.open = function (item) {
    if (cw.items.indexOf(item) < 0) {
      return;
    }
    var candidate = candidates[item.sourceId];
    if (candidate) {
      candidate.provider.open(item);
    }
  };

  cw.start = function () {
    if (started) {
      return;
    }
    started = true;
    clockWall = Date.now();
    clockElapsed = retryTime();
    startupUntil = clockElapsed + 300000;
    if (A.clock && A.clock.subscribe) {
      A.clock.subscribe(checkClock);
    }
    A.apps.subscribe(cw.refresh);
    A.settings.subscribe(function () {
      var next = JSON.stringify([
        A.settings.getSnapshot().continueWatching,
        A.settings.getSnapshot().continueWatchingApps,
      ]);
      if (signature !== next) {
        signature = next;
        cw.refresh(true);
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        cancel();
      } else {
        cw.refresh();
      }
    });
    signature = JSON.stringify([
      A.settings.getSnapshot().continueWatching,
      A.settings.getSnapshot().continueWatchingApps,
    ]);
    cw.refresh();
  };
})(window.AeroTizen);
