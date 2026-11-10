import type { AppsService } from "../contracts/apps";
import type {
  ContinueFeedItem,
  ContinueWatchingPlatform,
  ContinueWatchingProvider,
  ContinueWatchingService,
  ContinueWatchingSnapshot,
} from "../contracts/continueWatching";
import type { ClockService, ContinueSource } from "../contracts/launcher";
import type { SettingsStore } from "../contracts/preferences";
import { createStore } from "../shared/state/createStore";
import { equalRecord } from "../shared/state/equalRecord";
import { snapshotList } from "../shared/state/snapshotList";

import { normalizeContinueItems } from "./continueWatching/normalizeItems";

interface ContinueWatchingDependencies {
  apps: Pick<AppsService, "getSnapshot" | "subscribeDiscovery">;
  clock: Pick<ClockService, "subscribe">;
  elapsed(): number;
  now(): number;
  platform: ContinueWatchingPlatform;
  providers: readonly ContinueWatchingProvider[];
  settings: SettingsStore;
  timers: Pick<Window, "setTimeout" | "clearTimeout">;
}

interface Candidate {
  readonly provider: ContinueWatchingProvider;
  readonly source: ContinueSource;
}

const STARTUP_RETRIES = [2000, 5000, 15000, 30000, 60000, 60000, 60000, 60000] as const;
const REFRESH_RETRIES = [2000, 2000] as const;
const STARTUP_WINDOW_MS = 300000;
const CLOCK_CHANGE_MS = 1000;
const byName = (left: ContinueSource, right: ContinueSource) => left.name.localeCompare(right.name);

export const createContinueWatchingService = ({
  apps,
  clock,
  elapsed,
  now,
  platform,
  providers,
  settings,
  timers,
}: ContinueWatchingDependencies): ContinueWatchingService => {
  const store = createStore<ContinueWatchingSnapshot>(
    Object.freeze({
      items: Object.freeze([]),
      messageKey: "",
      sources: Object.freeze([]),
    }),
  );
  const pendingTimers = new Set<number>();
  const feeds = new Map<string, readonly unknown[]>();
  let candidates = new Map<string, Candidate>();
  let sources: readonly ContinueSource[] = [];
  let items: readonly ContinueFeedItem[] = store.getSnapshot().items;
  let messageKey: ContinueWatchingSnapshot["messageKey"] = "";
  let generation = 0;
  let started = false;
  let disposed = false;
  let startupUntil = 0;
  let clockWall = 0;
  let clockElapsed = 0;
  let selectionSignature = "";
  let unsubscribers: (() => void)[] = [];

  const publish = () => {
    if (disposed) {
      return;
    }
    const previous = store.getSnapshot();
    const nextSources = snapshotList(sources, previous.sources);
    if (previous.items !== items || previous.sources !== nextSources || previous.messageKey !== messageKey) {
      store.set(Object.freeze({ items, sources: nextSources, messageKey }));
    }
  };
  const later = (action: () => void, delay: number) => {
    const timer = timers.setTimeout(() => {
      pendingTimers.delete(timer);
      action();
    }, delay);
    pendingTimers.add(timer);
  };
  const cancel = () => {
    generation++;
    pendingTimers.forEach((timer) => timers.clearTimeout(timer));
    pendingTimers.clear();
    providers.forEach((provider) => provider.cancel());
  };
  const isSelected = (source: ContinueSource) =>
    !!source.storeId && settings.getSnapshot().continueWatchingApps.includes(source.id);
  const updateMessage = () => {
    if (!apps.getSnapshot().ready) {
      messageKey = "continue.findingApps";
    } else {
      messageKey = sources.length ? "" : "continue.noApps";
    }
  };
  const status = (source: ContinueSource, value: string) => {
    sources = sources.map((entry) => (entry.id === source.id ? { ...entry, status: value } : entry));
  };
  const merge = () => {
    const previous = new Map(items.map((item) => [item.key, item]));
    const next = sources
      .reduce<ContinueFeedItem[]>(
        (records, source) => records.concat(normalizeContinueItems(source, feeds.get(source.id) || [], now())),
        [],
      )
      .map((item, index) => ({ item, index }))
      .sort((left, right) => right.item.timestamp - left.item.timestamp || left.index - right.index)
      .slice(0, 30)
      .map(({ item }) => {
        const old = previous.get(item.key);
        return old && equalRecord(old, item) ? old : Object.freeze(item);
      });
    if (items.length !== next.length || next.some((item, index) => item !== items[index])) {
      items = Object.freeze(next);
    }
    publish();
  };
  const remove = (source: ContinueSource) => {
    sources = sources.filter((entry) => entry.id !== source.id);
    feeds.delete(source.id);
    updateMessage();
    merge();
  };
  const retry = (attempt: number, warmup: boolean, action: () => void) => {
    const delays = warmup ? STARTUP_RETRIES : REFRESH_RETRIES;
    const remaining = warmup ? startupUntil - elapsed() : Infinity;
    if (attempt >= delays.length || remaining <= 0) {
      return false;
    }
    later(action, Math.min(delays[attempt], remaining));
    return true;
  };
  const read = (candidate: Candidate, token: number, attempt: number, warmup: boolean) => {
    if (disposed || token !== generation) {
      return;
    }
    const { source, provider } = candidate;
    const checked = !!provider.check;
    provider.read(source, (error, records) => {
      if (disposed || token !== generation) {
        return;
      }
      const failed = error || !Array.isArray(records);
      const values: unknown[] = !failed && Array.isArray(records) ? records : [];
      const count = checked ? values.length : normalizeContinueItems(source, values, now()).length;
      if (
        !checked &&
        (failed ? warmup : !count) &&
        retry(attempt, warmup, () => read(candidate, token, attempt + 1, warmup))
      ) {
        status(source, "Checking for items");
        publish();
        return;
      }
      if (failed && checked) {
        remove(source);
        return;
      }
      // Retain bounded raw records so later clock corrections can revalidate activity.
      feeds.set(
        source.id,
        values.slice(0, 200).map((value) => (value && typeof value === "object" ? { ...value } : value)),
      );
      if (failed) {
        status(source, "Unavailable");
      } else if (!count) {
        status(source, "No items available");
      } else if (checked) {
        status(source, "Available");
      } else {
        status(source, count + (count === 1 ? " item" : " items"));
      }
      merge();
    });
  };
  const check = (candidate: Candidate, token: number, attempt: number) => {
    if (disposed || token !== generation) {
      return;
    }
    const { source, provider } = candidate;
    provider.check?.(source, (available) => {
      if (disposed || token !== generation) {
        return;
      }
      const visible = sources.some((entry) => entry.id === source.id);
      if (!available) {
        if (visible) {
          remove(source);
        }
        retry(attempt, true, () => check(candidate, token, attempt + 1));
        return;
      }
      if (!visible) {
        sources = [...sources, source].sort(byName);
        updateMessage();
      }
      if (!isSelected(source)) {
        if (!visible) {
          merge();
        }
        return;
      }
      status(source, "Checking for items");
      publish();
      read(candidate, token, 0, false);
    });
  };
  const refresh = (choicesChanged = false) => {
    if (disposed) {
      return;
    }
    const previous = sources;
    cancel();
    candidates = new Map();
    sources = [];
    messageKey = "";
    if (!settings.getSnapshot().continueWatching || !platform.isAvailable()) {
      feeds.clear();
      items = store.getSnapshot().items.length ? Object.freeze([]) : store.getSnapshot().items;
      if (settings.getSnapshot().continueWatching) {
        messageKey = "continue.tvOnly";
      }
      publish();
      return;
    }
    providers.forEach((provider) => {
      provider.discover(apps.getSnapshot().inventory).forEach((source) => {
        // An earlier adapter claims an app even while its feed is unavailable.
        if (!candidates.has(source.id)) {
          candidates.set(source.id, { source: Object.freeze({ ...source }), provider });
        }
      });
    });
    const token = generation;
    const discovered = [...candidates.values()];
    sources = discovered
      .filter(({ source, provider }) => !provider.check || previous.some((entry) => entry.id === source.id))
      .map(({ source }) => (isSelected(source) ? { ...source, status: "Checking for items" } : source))
      .sort(byName);
    updateMessage();
    feeds.forEach((_, id) => {
      const candidate = candidates.get(id);
      if (!candidate || !isSelected(candidate.source)) {
        feeds.delete(id);
      }
    });
    merge();
    if (platform.isHidden()) {
      return;
    }
    const warmup = elapsed() < startupUntil;
    discovered.forEach((candidate) => {
      const { source, provider } = candidate;
      if (provider.check) {
        if (!choicesChanged || isSelected(source) || !sources.some((entry) => entry.id === source.id)) {
          check(candidate, token, 0);
        }
      } else if (isSelected(source)) {
        read(candidate, token, 0, warmup);
      }
    });
  };
  const checkClock = () => {
    const wall = now();
    const monotonic = elapsed();
    const changed = Math.abs(wall - clockWall - (monotonic - clockElapsed)) > CLOCK_CHANGE_MS;
    clockWall = wall;
    clockElapsed = monotonic;
    if (changed && items.length && settings.getSnapshot().continueWatching && !platform.isHidden()) {
      merge();
    }
  };
  const selection = () => {
    const preferences = settings.getSnapshot();
    return JSON.stringify([preferences.continueWatching, preferences.continueWatchingApps]);
  };
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    refresh,
    open(item) {
      const active = items.find((entry) => entry === item);
      if (!disposed && active) {
        candidates.get(active.sourceId)?.provider.open(active);
      }
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      clockWall = now();
      clockElapsed = elapsed();
      startupUntil = clockElapsed + STARTUP_WINDOW_MS;
      selectionSignature = selection();
      unsubscribers = [
        clock.subscribe(checkClock),
        apps.subscribeDiscovery(() => refresh()),
        settings.subscribe(() => {
          const next = selection();
          if (selectionSignature !== next) {
            selectionSignature = next;
            refresh(true);
          }
        }),
        platform.subscribeVisibility(() => (platform.isHidden() ? cancel() : refresh())),
      ];
      refresh();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancel();
      providers.forEach((provider) => provider.dispose?.());
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      feeds.clear();
      candidates.clear();
    },
  };
};
