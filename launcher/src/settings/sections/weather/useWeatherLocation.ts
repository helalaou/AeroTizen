import type { JSX } from "preact";
import { flushSync } from "preact/compat";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

import type { WeatherLocation } from "../../../contracts/preferences";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";
import type { SettingsActions } from "../../types";

import { useWeatherSearch } from "./useWeatherSearch";

export const useWeatherLocation = (active: boolean, actions: SettingsActions) => {
  const { services, navigation, drawer } = useSettingsEnvironment();
  const selected = useStoreSelector(drawer, (state) => state.expanded && state.category === "weather");
  const city = useStoreSelector(services.weather, (weather) => weather.city);
  const enabled = active && selected;
  const [editing, setEditing] = useState(false);
  const search = useWeatherSearch(services.searchLocations, enabled && editing);
  const { clear } = search;
  const input = useRef<HTMLInputElement>(null);
  const previousResults = useRef(search.results);
  const close = () => {
    flushSync(() => {
      clear();
      setEditing(false);
      navigation.select("weather:change");
    });
  };
  useLayoutEffect(() => {
    if (!enabled) {
      setEditing(false);
    }
  }, [enabled]);
  useLayoutEffect(() => {
    navigation.invalidate();
    if (enabled) {
      if (editing && search.results.length && search.results !== previousResults.current) {
        navigation.select("weather:result:0");
      }
      navigation.focus();
    }
    previousResults.current = search.results;
  }, [search.results, search.message, editing, city, enabled, navigation]);
  useLayoutEffect(() => {
    if (!enabled || !editing) {
      return;
    }
    const back = (event: KeyboardEvent) => {
      const { KEY } = services.config;
      if ((event.keyCode !== KEY.BACK && event.keyCode !== KEY.ESC) || document.activeElement === input.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      flushSync(() => {
        clear();
        setEditing(false);
        navigation.select("weather:change");
      });
    };
    document.addEventListener("keydown", back, true);
    return () => document.removeEventListener("keydown", back, true);
  }, [enabled, editing, services.config, clear, navigation]);
  return {
    ...search,
    city,
    editing,
    inputRef: input,
    toggleEditing() {
      if (editing) {
        close();
        return;
      }
      flushSync(() => {
        setEditing(true);
        navigation.select("weather:query");
      });
      input.current?.focus();
    },
    focusQuery: () => input.current?.focus(),
    onQueryInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) => search.setQuery(event.currentTarget.value),
    onQueryKeyDown(event: JSX.TargetedKeyboardEvent<HTMLInputElement>) {
      const { KEY } = services.config;
      const done = event.keyCode === KEY.IME_DONE;
      if (!done && event.keyCode !== KEY.ENTER && event.key !== "Enter") {
        return;
      }
      if (event.isComposing && !done) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.blur();
      navigation.select("weather:search");
      search.search();
      navigation.focus();
    },
    selectLocation(location: WeatherLocation | null) {
      actions.setLocation(location);
      close();
    },
  };
};
