import { useSyncExternalStore } from "preact/compat";

import type { Store } from "../state/createStore";

export const useStore = <T>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.getSnapshot);

// Select a primitive or an existing stable object so unrelated updates do not render the view.
export const useStoreSelector = <T, Value>(store: Store<T>, select: (snapshot: T) => Value): Value =>
  useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()));
