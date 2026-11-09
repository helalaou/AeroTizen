import type {
  NativeHomeReport,
  NativeHomeTestAction,
  NativeHomeTestPlatform,
  NativeHomeTestService,
  NativeHomeTestSnapshot,
} from "../../contracts/nativeHomeTest";
import { createNativeHomeTestPlatform } from "../../platform/tizen/createNativeHomeTestPlatform";
import { createStore } from "../../shared/state/createStore";

const messageFor = (report: NativeHomeReport, action: NativeHomeTestAction): NativeHomeTestSnapshot["message"] => {
  const result = action === "set" ? report.set_test : report;
  if (result?.status === "interrupted") {
    return "interrupted";
  }
  if (action === "set" && result?.query?.baseline_unchanged === false) {
    return "changed";
  }
  if (action === "set" && result?.query?.success && result.query.baseline_unchanged === true) {
    return "setPassed";
  }
  if (action === "get" && report.status === "query_completed") {
    return report.can_set ? "getPassed" : "getBlocked";
  }
  return "failed";
};

export const createNativeHomeTestService = (
  platform: NativeHomeTestPlatform = createNativeHomeTestPlatform(window.AeroTizen),
): NativeHomeTestService => {
  const state = createStore<NativeHomeTestSnapshot>({ busy: null, ready: false, report: null, message: "loading" });
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const publish = (value: Partial<NativeHomeTestSnapshot>) => state.set({ ...state.getSnapshot(), ...value });
  const pause = () =>
    new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, 750);
    });
  const failed = (error: unknown) =>
    publish({
      busy: null,
      ready: false,
      message: error instanceof Error && error.message === "tv_required" ? "tvRequired" : "offline",
    });
  const collect = async (current: number, action: NativeHomeTestAction, initial: NativeHomeReport) => {
    let report = initial;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (current !== generation) {
        return;
      }
      publish({ report, ready: true });
      const result = action === "set" ? report.set_test : report;
      if (result?.status !== "launch_requested") {
        publish({ busy: null, message: report.status === "not_run" ? "ready" : messageFor(report, action) });
        return;
      }
      publish({ busy: action });
      await pause();
      if (current !== generation) {
        return;
      }
      report = await platform.request("GET");
    }
    if (current === generation) {
      publish({ busy: null, ready: false, message: "interrupted" });
    }
  };
  return {
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
    async refresh() {
      if (state.getSnapshot().busy) {
        return;
      }
      const current = ++generation;
      publish({ busy: "refresh", message: "loading" });
      try {
        let report: NativeHomeReport;
        try {
          report = await platform.request("GET");
        } catch {
          if (current !== generation) {
            return;
          }
          await platform.startService();
          if (current !== generation) {
            return;
          }
          report = await platform.request("GET");
        }
        if (current !== generation) {
          return;
        }
        const action = report.set_test ? "set" : "get";
        await collect(current, action, report);
      } catch (error) {
        if (current === generation) {
          failed(error);
        }
      }
    },
    async run(action) {
      const before = state.getSnapshot();
      if (
        !before.ready ||
        before.busy ||
        !before.report ||
        (action === "get" && before.report.status !== "not_run") ||
        (action === "set" && (!before.report.can_set || before.report.set_test))
      ) {
        return;
      }
      const current = ++generation;
      publish({ busy: action });
      try {
        await platform.request("POST", action);
        if (current !== generation) {
          return;
        }
        await collect(current, action, await platform.request("GET"));
      } catch (error) {
        if (current === generation) {
          failed(error);
        }
      }
    },
    dispose() {
      generation += 1;
      clearTimeout(timer);
      wake?.();
      publish({ busy: null });
    },
  };
};
