import { useContext, useLayoutEffect, useMemo, useRef } from "preact/hooks";

import type { InputScopeOptions } from "../../contracts/remoteInput";

import { InputScopeContext } from "./context";
import { createInputScope } from "./createInputScope";

export const useInputScope = (options: InputScopeOptions) => {
  const parent = useContext(InputScopeContext);
  if (!parent) {
    throw new Error("Input scopes require a parent provider.");
  }
  const latest = useRef(options);
  const wasActive = useRef(options.isActive?.() ?? true);
  const scope = useMemo(
    () =>
      createInputScope({
        allowActionRepeats: options.allowActionRepeats,
        modal: options.modal,
        subscribe: options.subscribe,
        isActive: () => latest.current.isActive?.() ?? true,
        handle: (event) => latest.current.handle?.(event) ?? "unhandled",
        onCancel: () => latest.current.onCancel?.(),
      }),
    [options.allowActionRepeats, options.modal, options.subscribe],
  );
  useLayoutEffect(() => {
    latest.current = options;
    const active = options.isActive?.() ?? true;
    if (wasActive.current && !active) {
      scope.cancel();
    }
    wasActive.current = active;
  });
  useLayoutEffect(() => parent.registerChild(scope), [parent, scope]);
  return scope;
};
