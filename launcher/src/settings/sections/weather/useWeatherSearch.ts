import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import type { SettingsServices, WeatherLocation } from '../../types';

interface SearchState { query: string; results: WeatherLocation[]; message: string }

export const useWeatherSearch = (searchLocations: SettingsServices['searchLocations'], active: boolean) => {
  const [state, setState] = useState<SearchState>({ query: '', results: [], message: '' });
  const query = useRef('');
  const cancel = useRef<(() => void) | undefined>(undefined);
  const version = useRef(0);
  const enabled = useRef(active);
  enabled.current = active;
  const clear = () => {
    version.current++; cancel.current?.(); cancel.current = undefined;
    setState(previous => ({ ...previous, results: [], message: '' }));
  };
  useLayoutEffect(() => {
    if (!active) { clear(); }
    return () => { version.current++; cancel.current?.(); cancel.current = undefined; };
  }, [active]);
  return {
    ...state, clear,
    setQuery: (next: string) => {
      clear(); query.current = next; setState({ query: next, results: [], message: '' });
    },
    search: () => {
      clear();
      const text = query.current.trim(), request = version.current;
      setState(previous => ({ ...previous, message: text.length < 2 ?
        'Enter at least two characters, then select Search.' : 'Searching…' }));
      if (text.length < 2) { return; }
      cancel.current = searchLocations(text, results => {
        if (!enabled.current || request !== version.current) { return; }
        flushSync(() => setState(previous => ({ ...previous, results: results || [], message: results === null ?
          'Could not search. Check your connection and try again.' : results.length ?
            'Select your location. Add a region or country to the search if needed.' :
            'No locations found. Try a nearby town or add a region or country.' })));
      });
    }
  };
};
