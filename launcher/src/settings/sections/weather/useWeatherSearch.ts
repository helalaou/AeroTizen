import { flushSync } from "preact/compat";
import { useCallback, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { WeatherLocation } from "../../../contracts/preferences";
import type { MessageKey } from "../../../shared/i18n/catalogues";
import type { SettingsServices } from "../../types";

interface SearchState {
  message: MessageKey | "";
  query: string;
  results: WeatherLocation[];
}

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
  const [state, setState] = useState<SearchState>({ query: "", results: [], message: "" });
  const cancel = useRef<(() => void) | undefined>(undefined);
  const version = useRef(0);
  const enabled = useRef(active);
  const cancelSearch = useCallback(() => {
    version.current++;
    cancel.current?.();
    cancel.current = undefined;
  }, []);
  const clear = useCallback(() => {
    cancelSearch();
    setState((previous) => ({ ...previous, results: [], message: "" }));
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
    setQuery: (next: string) => {
      clear();
      flushSync(() => setState({ query: next, results: [], message: "" }));
    },
    search: () => {
      clear();
      const text = state.query.trim();
      const request = version.current;
      setState((previous) => ({
        ...previous,
        message: text.length < 2 ? "weather.searchTooShort" : "weather.searching",
      }));
      if (text.length < 2) {
        return;
      }
      cancel.current = searchLocations(text, (results) => {
        if (!enabled.current || request !== version.current) {
          return;
        }
        flushSync(() =>
          setState((previous) => ({
            ...previous,
            results: results || [],
            message: getSearchMessage(results),
          })),
        );
      });
    },
  };
};
