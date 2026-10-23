import { useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import type { Store } from '../state/createStore';

// Subscribe before the next remote event, including the first open. Read again
// after subscribing so changes between render and commit cannot be missed.
export const useStore = <T>(store: Store<T>, active = true): T => {
  const [, update] = useReducer((version: number) => version + 1, 0);
  const value = store.getSnapshot();
  const latest = useRef(value);
  latest.current = value;
  useLayoutEffect(() => {
    if (!active) { return; }
    const changed = () => {
      const next = store.getSnapshot();
      if (!Object.is(latest.current, next)) { latest.current = next; update(undefined); }
    };
    const unsubscribe = store.subscribe(changed);
    changed();
    return unsubscribe;
  }, [store, active]);
  return value;
};
