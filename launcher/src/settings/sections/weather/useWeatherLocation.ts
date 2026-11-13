import { flushSync } from "preact/compat";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

import type { WeatherLocation } from "../../../contracts/preferences";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useInputScope } from "../../../shared/input/useInputScope";
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
  const inputScope = useInputScope({
    isActive: () => enabled && editing,
    handle({ action, phase }) {
      if (phase === "down" && action === "back") {
        close();
        navigation.focus();
        return "handled";
      }
      return "unhandled";
    },
  });
  return {
    ...search,
    city,
    editing,
    enabled,
    inputScope,
    toggleEditing() {
      if (editing) {
        close();
        return;
      }
      flushSync(() => {
        setEditing(true);
        navigation.select("weather:query");
      });
    },
    submitQuery() {
      navigation.select("weather:search");
      search.search();
    },
    selectLocation(location: WeatherLocation | null) {
      actions.setLocation(location);
      close();
    },
  };
};
