import type { JSX } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

import type { WeatherLocation } from "../../../contracts/preferences";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";
import type { SettingsActions } from "../../types";

import { useWeatherSearch } from "./useWeatherSearch";

export const useWeatherLocation = (active: boolean, actions: SettingsActions) => {
  const { services, navigation, view } = useSettingsEnvironment();
  const search = useWeatherSearch(services.searchLocations, active);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    navigation.invalidate();
    if (active && !view.getSnapshot().previewing) {
      navigation.focus();
    }
  }, [search.results, search.message, active, navigation, view]);
  return {
    ...search,
    inputRef: input,
    focusQuery: () => input.current?.focus(),
    onQueryInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) => search.setQuery(event.currentTarget.value),
    selectLocation: (location: WeatherLocation | null) => {
      search.clear();
      navigation.select(location ? "weather:query" : "weather:auto");
      actions.setLocation(location);
    },
  };
};
