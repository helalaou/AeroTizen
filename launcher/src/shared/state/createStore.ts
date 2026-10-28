export interface Store<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export interface MutableStore<T> extends Store<T> {
  set(next: T): void;
}

export const createStore = <T>(initial: T): MutableStore<T> => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(next) {
      if (Object.is(snapshot, next)) { return; }
      snapshot = next;
      [...listeners].forEach(listener => listener());
    }
  };
};
