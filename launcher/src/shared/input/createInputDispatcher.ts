import type { LauncherConfig } from "../../contracts/launcher";
import type { InputAction, InputScope, NativeKeyEvent, ScopedInputEvent } from "../../contracts/remoteInput";

const SPACE_KEY_CODE = 32;
const SINGLE_PRESS_ACTIONS: readonly InputAction[] = ["confirm", "back", "done", "cancel"];

interface Press {
  readonly cancelled: boolean;
  readonly generations: readonly number[];
  readonly path: readonly InputScope[];
}

const isCurrent = (press: Press, path: readonly InputScope[]) =>
  !press.cancelled &&
  press.path.length === path.length &&
  press.path.every((scope, index) => scope === path[index] && scope.getGeneration() === press.generations[index]);

const deliver = (path: readonly InputScope[], event: ScopedInputEvent) => {
  for (let index = path.length - 1; index >= 0; index--) {
    const scope = path[index];
    const result = scope.receive(event);
    if (result === "handled") {
      event.nativeEvent.preventDefault();
      return;
    }
    if (result === "native" || scope.modal) {
      return;
    }
  }
};

// Roots are supplied in priority order. Children bubble only within their owning root.
export const createInputDispatcher = (keys: LauncherConfig["KEY"], roots: readonly InputScope[]) => {
  const actions: Readonly<Record<number, InputAction>> = {
    [keys.LEFT]: "left",
    [keys.RIGHT]: "right",
    [keys.UP]: "up",
    [keys.DOWN]: "down",
    [keys.ENTER]: "confirm",
    [SPACE_KEY_CODE]: "confirm",
    [keys.BACK]: "back",
    [keys.ESC]: "back",
    [keys.IME_DONE]: "done",
    [keys.IME_CANCEL]: "cancel",
  };
  const presses = new Map<number, Press>();
  let disposed = false;
  const cancelPress = (code: number, press: Press) => {
    if (!press.cancelled) {
      presses.set(code, { ...press, cancelled: true });
      press.path[press.path.length - 1]?.cancel();
    }
  };
  const currentPath = () => {
    for (const root of roots) {
      const path = root.getPath();
      if (path.length) {
        return path;
      }
    }
    return [];
  };
  const synchronize = () => {
    const path = currentPath();
    for (const [code, press] of presses) {
      if (!isCurrent(press, path)) {
        cancelPress(code, press);
      }
    }
  };
  const subscriptions = roots.map((scope) => scope.subscribe(synchronize));
  const cancel = () => {
    const pending = [...presses.values()];
    presses.clear();
    for (const press of pending) {
      if (!press.cancelled) {
        press.path[press.path.length - 1]?.cancel();
      }
    }
  };
  return {
    keydown(code: number, nativeEvent: NativeKeyEvent) {
      if (disposed) {
        return;
      }
      const previous = presses.get(code);
      const path = currentPath();
      const action = actions[code] ?? "other";
      if (previous && !isCurrent(previous, path)) {
        cancelPress(code, previous);
        nativeEvent.preventDefault();
        return;
      }
      const composing = nativeEvent.isComposing && code !== keys.IME_DONE;
      if (
        (previous || nativeEvent.repeat) &&
        !composing &&
        !path[path.length - 1]?.allowActionRepeats &&
        SINGLE_PRESS_ACTIONS.includes(action)
      ) {
        nativeEvent.preventDefault();
        return;
      }
      const press = previous ?? { path, generations: path.map((scope) => scope.getGeneration()), cancelled: false };
      presses.set(code, press);
      deliver(path, { action, code, nativeEvent, phase: "down", repeat: !!previous || nativeEvent.repeat === true });
      const pending = presses.get(code);
      if (pending && !isCurrent(pending, currentPath())) {
        cancelPress(code, pending);
      }
    },
    keyup(code: number, nativeEvent: NativeKeyEvent) {
      if (disposed) {
        return;
      }
      const press = presses.get(code);
      presses.delete(code);
      if (!press) {
        return;
      }
      if (!isCurrent(press, currentPath())) {
        if (!press.cancelled) {
          press.path[press.path.length - 1]?.cancel();
        }
        return;
      }
      deliver(press.path, { action: actions[code] ?? "other", code, nativeEvent, phase: "up", repeat: false });
    },
    cancel,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      cancel();
    },
  };
};
