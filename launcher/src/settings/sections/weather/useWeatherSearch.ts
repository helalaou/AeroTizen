import { flushSync } from "preact/compat";
import { useCallback, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { WeatherLocation } from "../../../contracts/preferences";
import type { MessageKey } from "../../../shared/i18n/catalogues";
import type { SettingsServices } from "../../types";

interface SearchState {
  busy: boolean;
  message: MessageKey | "";
  query: string;
  results: readonly WeatherLocation[];
}

const NO_RESULTS: readonly WeatherLocation[] = Object.freeze([]);

const getSearchMessage = (results: WeatherLocation[] | null): MessageKey => {
  if (results === null) {
    return "weather.searchFailed";
  }
  if (!results.length) {
    return "weather.searchEmpty";
  }
  return "weather.searchResults";
};

export const useWeatherSearch = (searchLocations: SettingsServices["searchLocations"], active: boolean) => {
  const [state, setState] = useState<SearchState>({ query: "", results: NO_RESULTS, message: "", busy: false });
  const cancel = useRef<(() => void) | undefined>(undefined);
  const version = useRef(0);
  const pendingQuery = useRef<string | null>(null);
  const enabled = useRef(active);
  const cancelSearch = useCallback(() => {
    version.current++;
    pendingQuery.current = null;
    cancel.current?.();
    cancel.current = undefined;
  }, []);
  const clear = useCallback(() => {
    cancelSearch();
    setState((previous) => {
      if (previous.results === NO_RESULTS && !previous.message && !previous.busy) {
        return previous;
      }
      return { ...previous, results: NO_RESULTS, message: "", busy: false };
    });
  }, [cancelSearch]);
  useLayoutEffect(() => {
    enabled.current = active;
    if (!active) {
      clear();
    }
    return cancelSearch;
  }, [active, clear, cancelSearch]);
  return {
    ...state,
    clear,
    setQuery(next: string) {
      cancelSearch();
      flushSync(() => setState({ query: next, results: NO_RESULTS, message: "", busy: false }));
    },
    search() {
      const text = state.query.trim();
      if (!enabled.current || pendingQuery.current === text) {
        return;
      }
      cancelSearch();
      const request = version.current;
      if (text.length < 2) {
        flushSync(() =>
          setState((previous) => ({
            ...previous,
            results: NO_RESULTS,
            message: "weather.searchTooShort",
            busy: false,
          })),
        );
        return;
      }
      pendingQuery.current = text;
      flushSync(() =>
        setState((previous) => ({
          ...previous,
          results: NO_RESULTS,
          message: "weather.searching",
          busy: true,
        })),
      );
      cancel.current = searchLocations(text, (results) => {
        if (!enabled.current || request !== version.current) {
          return;
        }
        pendingQuery.current = null;
        cancel.current = undefined;
        flushSync(() =>
          setState((previous) => ({
            ...previous,
            results: results?.length ? results : NO_RESULTS,
            message: getSearchMessage(results),
            busy: false,
          })),
        );
      });
    },
  };
};
