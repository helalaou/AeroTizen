import { useSyncExternalStore } from 'preact/compat';
import type { Store } from '../state/createStore';

export const useStore = <T>(store: Store<T>): T =>
  useSyncExternalStore(store.subscribe, store.getSnapshot);
