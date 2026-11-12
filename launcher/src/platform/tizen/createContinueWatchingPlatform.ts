import type { ContinueWatchingPlatform } from "../../contracts/continueWatching";

interface ContinueWatchingHost {
  document: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
  tizen?: { application?: { getAppMetaData?: unknown } };
}

export const createContinueWatchingPlatform = (host: ContinueWatchingHost): ContinueWatchingPlatform => ({
  isAvailable: () => typeof host.tizen?.application?.getAppMetaData === "function",
  isHidden: () => host.document.hidden,
  subscribeVisibility(listener) {
    host.document.addEventListener("visibilitychange", listener);
    return () => host.document.removeEventListener("visibilitychange", listener);
  },
});
