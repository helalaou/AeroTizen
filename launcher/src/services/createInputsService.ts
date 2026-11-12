import type { InputPlayback, InputsPlatform, InputsService, InputsSnapshot } from "../contracts/inputs";
import type { IpControlCommand, LearnIpControlResult } from "../contracts/ipControl";
import { isHdmiPort } from "../contracts/ipControl";
import type { InputSource } from "../contracts/launcher";
import type { SettingsStore } from "../contracts/preferences";
import type { Translate } from "../shared/i18n/createTranslations";
import { hasRecognizedDevice, inputRecord, sourceKey } from "../shared/inputs/inputSources";
import { createStore } from "../shared/state/createStore";
import { equalRecord } from "../shared/state/equalRecord";

const INPUT_TIMEOUT_MS = 8_000;
const INPUT_REFRESH_MS = 5_000;
const RESTORE_ATTEMPTS = 4;
const RESTORE_DELAY_MS = 1_000;

const replyRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : null;
const mergeSources = (reported: readonly InputSource[], ports: readonly number[]): readonly InputSource[] => {
  const additional = ports.filter(
    (port) => !reported.some((source) => source.type === "HDMI" && source.number === port),
  );
  if (!additional.length) {
    return reported;
  }
  return [...reported, ...additional.map<InputSource>((number) => ({ type: "HDMI", number, ipControl: true }))].sort(
    (a, b) =>
      Number(a.type === "TV") - Number(b.type === "TV") ||
      Number(!!b.connected) - Number(!!a.connected) ||
      (a.number || 0) - (b.number || 0),
  );
};

export const createInputsService = ({
  platform,
  settings,
  timers,
  translate,
  toast,
}: {
  platform: InputsPlatform;
  settings: Pick<SettingsStore, "getSnapshot" | "subscribe">;
  timers: Pick<Window, "setInterval" | "clearInterval" | "setTimeout" | "clearTimeout">;
  translate: Translate;
  toast(message: string): void;
}): InputsService => {
  const empty: readonly InputSource[] = Object.freeze([]);
  const store = createStore<InputsSnapshot>(Object.freeze({ sources: empty, visibleSources: empty, playback: "idle" }));
  const subscriptions = new Set<() => void>();
  let disposed = false;
  let started = false;
  let selection = 0;
  let playback = 0;
  let playingSource: InputSource | null = null;
  let timeout: number | undefined;
  let interval: number | undefined;
  let pending: (() => void) | undefined;
  let wasHidden = false;
  let unsubscribers: (() => void)[] = [];
  let reported: readonly InputSource[] = empty;
  let learnedPorts: readonly number[] = [];
  let sourcesReady = false;
  let revision = 0;
  let learning: Promise<LearnIpControlResult> | undefined;
  let restoreTimer: number | undefined;
  const alwaysVisible = (source: InputSource) =>
    source.type === "HDMI" &&
    (source.ipControl === true || settings.getSnapshot().hdmiKeepVisible[String(source.number)] === true);
  const isVisible = (source: InputSource) => {
    const preferences = settings.getSnapshot();
    if (source.type === "TV") {
      return preferences.showLiveTv;
    }
    return (
      source.type !== "HDMI" ||
      !preferences.hideDisconnectedHdmi ||
      source.connected === true ||
      hasRecognizedDevice(source) ||
      alwaysVisible(source)
    );
  };
  const publish = (sources = store.getSnapshot().sources, state: InputPlayback = store.getSnapshot().playback) => {
    if (disposed) {
      return;
    }
    const previous = store.getSnapshot();
    const filtered = sources.filter(isVisible);
    const visibleSources =
      filtered.length === previous.visibleSources.length &&
      filtered.every((source, index) => source === previous.visibleSources[index])
        ? previous.visibleSources
        : Object.freeze(filtered);
    if (sources !== previous.sources || visibleSources !== previous.visibleSources || state !== previous.playback) {
      store.set(Object.freeze({ sources, visibleSources, playback: state }));
    }
  };
  const publishSources = () => {
    const before = store.getSnapshot();
    const byKey = new Map(before.sources.map((source) => [sourceKey(source), source]));
    const next = mergeSources(reported, learnedPorts).map((source) => {
      const old = byKey.get(sourceKey(source));
      return old && equalRecord(old, source) ? old : Object.freeze(source);
    });
    const sources =
      next.length === before.sources.length && next.every((source, index) => source === before.sources[index])
        ? before.sources
        : Object.freeze(next);
    publish(sources);
  };
  const applyPorts = (value: unknown) => {
    if (!disposed && Array.isArray(value)) {
      learnedPorts = [...new Set(value.filter(isHdmiPort))].sort((a, b) => a - b);
      publishSources();
    }
  };
  const requestIpControl = async (command: IpControlCommand) => {
    if (disposed) {
      return null;
    }
    try {
      const reply = await platform.ipControl?.request(command);
      return disposed ? null : replyRecord(reply);
    } catch {
      return null;
    }
  };
  const restorePorts = async (attempts: number): Promise<void> => {
    const current = revision;
    const reply = await requestIpControl({ action: "list" });
    if (disposed || current !== revision) {
      return;
    }
    if (reply?.status === "listed" && Array.isArray(reply.ports)) {
      applyPorts(reply.ports);
    } else if (attempts > 1) {
      restoreTimer = timers.setTimeout(() => void restorePorts(attempts - 1), RESTORE_DELAY_MS);
    }
  };
  const learnPort = async (): Promise<LearnIpControlResult> => {
    if (disposed || !platform.ipControl) {
      return { status: "unavailable" };
    }
    if (!sourcesReady) {
      return { status: "scanFailed" };
    }
    const nativePorts = reported
      .filter((source) => source.type === "HDMI")
      .map((source) => source.number)
      .filter(isHdmiPort);
    const reply = await requestIpControl({ action: "learn", nativePorts });
    if (disposed) {
      return { status: "unavailable" };
    }
    const status = reply?.status;
    if (status === "added" || status === "known" || status === "noHdmi") {
      if (Array.isArray(reply?.ports) && (status === "noHdmi" || isHdmiPort(reply?.port))) {
        // An older list reply must not overwrite a successful discovery.
        revision++;
        applyPorts(reply.ports);
        return status === "noHdmi" ? { status } : { status, port: reply.port as number };
      }
    }
    if (status === "pairFailed" || status === "readFailed" || status === "storageFailed") {
      return { status };
    }
    return { status: "unavailable" };
  };
  const portName = (source: InputSource) => (source.type === "TV" ? "Live TV" : source.type + " " + source.number);
  const label = (source: InputSource, defaultLabel?: string) =>
    settings.getSnapshot().inputNames[portName(source)] || source.editName || defaultLabel || portName(source);
  const displayLabel = (source: InputSource) =>
    label(source, source.type === "TV" ? translate("inputs.liveTv") : undefined);
  const notify: Translate = (key, values) => {
    const message = translate(key, values);
    toast(message);
    return message;
  };
  const clearTimeout = () => {
    if (timeout !== undefined) {
      timers.clearTimeout(timeout);
      timeout = undefined;
    }
  };
  const showEmbedded = (source: InputSource) => {
    if (disposed) {
      return;
    }
    if (!platform.canEmbed) {
      notify("inputs.wouldSwitch", { input: displayLabel(source) });
      return;
    }
    if (store.getSnapshot().playback !== "idle") {
      service.leave();
    }
    const id = ++playback;
    playingSource = source;
    publish(undefined, "opening");
    const failed = () => {
      if (!disposed && id === playback) {
        service.leave();
        notify("inputs.couldNotShow", { input: displayLabel(source) });
      }
    };
    timeout = timers.setTimeout(failed, INPUT_TIMEOUT_MS);
    try {
      platform.setSource(
        source,
        () => {
          if (disposed || id !== playback) {
            return;
          }
          try {
            platform.show(() => {
              if (disposed || id !== playback) {
                if (store.getSnapshot().playback === "idle") {
                  platform.hide();
                }
                return;
              }
              clearTimeout();
              publish(undefined, "playing");
            }, failed);
          } catch {
            failed();
          }
        },
        failed,
      );
    } catch {
      failed();
    }
  };
  const openSource = (source: InputSource, request: number) => {
    if (source.ipControl && isHdmiPort(source.number)) {
      const port = source.number;
      const failed = () => {
        if (!disposed && request === selection) {
          notify("inputs.switchFailed");
        }
      };
      if (
        !platform.openNative(source, {
          label: displayLabel(source),
          fallback: failed,
          selectSource: async () => (await requestIpControl({ action: "switch", port }))?.status === "switched",
        })
      ) {
        failed();
      }
      return;
    }
    const hdmi = source.type === "HDMI" && settings.getSnapshot().hdmiNativeViewer;
    const fallback = () => {
      if (!disposed && request === selection) {
        showEmbedded(source);
      }
    };
    if (
      (source.type === "TV" || hdmi) &&
      platform.openNative(source, hdmi ? { label: displayLabel(source), fallback } : null)
    ) {
      return;
    }
    showEmbedded(source);
  };
  const unsubscribeSettings = settings.subscribe(() => publish());
  const service: InputsService = {
    canLearnIpControlInput: () => !disposed && !!platform.ipControl,
    learnIpControlInput() {
      learning ??= learnPort().finally(() => {
        learning = undefined;
      });
      return learning;
    },
    getSnapshot: store.getSnapshot,
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      const unsubscribe = store.subscribe(listener);
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    alwaysVisible,
    hasRecognizedDevice,
    isVisible,
    label,
    portName,
    load(done) {
      if (disposed) {
        done?.(false);
        return;
      }
      pending?.();
      let active = true;
      let cancelRead = () => {};
      const cancel = () => {
        if (active) {
          active = false;
          cancelRead();
          done?.(false);
        }
      };
      pending = cancel;
      cancelRead = platform.read((records) => {
        if (!active || disposed) {
          return;
        }
        active = false;
        if (pending === cancel) {
          pending = undefined;
        }
        if (!records) {
          done?.(false);
          return;
        }
        reported = records.map(inputRecord);
        sourcesReady = true;
        publishSources();
        const sources = store.getSnapshot().sources;
        if (store.getSnapshot().playback === "playing" && playingSource?.type === "HDMI") {
          const key = sourceKey(playingSource);
          const current = sources.find((source) => sourceKey(source) === key);
          if (!current?.connected) {
            const input = displayLabel(playingSource);
            service.leave();
            notify("inputs.disconnected", { input });
          }
        }
        done?.(true);
      });
      if (!active) {
        cancelRead();
      }
    },
    show(source) {
      if (disposed || !source) {
        return;
      }
      const request = ++selection;
      if (source.ipControl || source.type !== "HDMI" || !platform.refreshBeforeHdmi) {
        openSource(source, request);
        return;
      }
      service.load((success) => {
        if (disposed || request !== selection || platform.isHidden()) {
          return;
        }
        const current = store.getSnapshot().sources.find((item) => sourceKey(item) === sourceKey(source));
        if (!success || !current?.connected) {
          notify("inputs.couldNotShow", { input: displayLabel(source) });
          return;
        }
        openSource(current, request);
      });
    },
    leave() {
      if (disposed) {
        return;
      }
      selection++;
      playback++;
      clearTimeout();
      playingSource = null;
      publish(undefined, "idle");
      platform.hide();
    },
    start() {
      if (disposed || started) {
        return;
      }
      started = true;
      if (platform.ipControl) {
        void restorePorts(RESTORE_ATTEMPTS);
      }
      unsubscribers = [
        platform.subscribeSources(() => service.load()),
        platform.subscribeHome(() => {
          if (store.getSnapshot().playback !== "idle") {
            service.leave();
          }
        }),
        platform.subscribeVisibility(() => {
          if (platform.isHidden()) {
            wasHidden = store.getSnapshot().playback !== "idle";
            return;
          }
          if (wasHidden && store.getSnapshot().playback !== "idle") {
            service.leave();
          }
          wasHidden = false;
          service.load();
        }),
      ];
      if (platform.native) {
        interval = timers.setInterval(() => {
          if (!platform.isHidden()) {
            service.load();
          }
        }, INPUT_REFRESH_MS);
      }
      service.load();
    },
    dispose() {
      if (disposed) {
        return;
      }
      if (store.getSnapshot().playback !== "idle") {
        service.leave();
      }
      disposed = true;
      platform.ipControl?.dispose();
      if (restoreTimer !== undefined) {
        timers.clearTimeout(restoreTimer);
      }
      selection++;
      playback++;
      pending?.();
      pending = undefined;
      clearTimeout();
      if (interval !== undefined) {
        timers.clearInterval(interval);
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      unsubscribeSettings();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions.clear();
    },
  };
  return service;
};
