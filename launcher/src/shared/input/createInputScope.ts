import type { InputScope, InputScopeOptions } from "../../contracts/remoteInput";
import { createStore } from "../state/createStore";

export const createInputScope = (options: InputScopeOptions = {}): InputScope => {
  const changes = createStore(0);
  let children: readonly InputScope[] = [];
  let generation = 0;
  const cancel = () => {
    generation += 1;
    options.onCancel?.();
  };
  const changed = () => {
    cancel();
    changes.set(changes.getSnapshot() + 1);
  };
  const scope: InputScope = {
    allowActionRepeats: options.allowActionRepeats ?? false,
    getSnapshot: changes.getSnapshot,
    subscribe(listener) {
      const stopChanges = changes.subscribe(listener);
      const stopActivation = options.subscribe?.(listener);
      return () => {
        stopChanges();
        stopActivation?.();
      };
    },
    modal: options.modal ?? false,
    cancel,
    getGeneration: () => generation,
    receive: (event) => options.handle?.(event) ?? "unhandled",
    getPath() {
      if (options.isActive && !options.isActive()) {
        return [];
      }
      for (let index = children.length - 1; index >= 0; index--) {
        const path = children[index].getPath();
        if (path.length) {
          return [scope, ...path];
        }
      }
      return [scope];
    },
    registerChild(child) {
      if (child === scope || children.includes(child)) {
        throw new Error("Input scope is already registered.");
      }
      children = [...children, child];
      const stopChildChanges = child.subscribe(() => changes.set(changes.getSnapshot() + 1));
      changed();
      let registered = true;
      return () => {
        if (registered) {
          registered = false;
          stopChildChanges();
          child.cancel();
          children = children.filter((candidate) => candidate !== child);
          changed();
        }
      };
    },
  };
  return scope;
};
