import type { HomeBridge, LauncherConfig, RemoteKeyHandler, SettingsBridge } from "../contracts/launcher";
import { createInputScope } from "../shared/input/createInputScope";

interface KeyTargets {
  fireplace: RemoteKeyHandler;
  home: Pick<HomeBridge, "cancelInput" | "keydown" | "keyup">;
  inputs: RemoteKeyHandler;
  settings: Pick<SettingsBridge, "focus" | "inputScope">;
}

// Existing screen controllers remain adapters while their controls adopt scoped actions.
export const createLauncherInputScopes = (
  document: Document,
  keys: LauncherConfig["KEY"],
  { fireplace, home, inputs, settings }: KeyTargets,
) => {
  const textExitKeys: readonly number[] = [keys.ENTER, keys.BACK, keys.ESC, keys.IME_DONE, keys.IME_CANCEL];
  const text = createInputScope({
    allowActionRepeats: true,
    isActive: () => document.activeElement?.tagName === "INPUT",
    subscribe(listener) {
      document.addEventListener("focusin", listener);
      document.addEventListener("focusout", listener);
      return () => {
        document.removeEventListener("focusin", listener);
        document.removeEventListener("focusout", listener);
      };
    },
    handle(event) {
      if (event.phase === "down" && (!event.nativeEvent.isComposing || event.code === keys.IME_DONE)) {
        const active = document.activeElement;
        if (active?.tagName === "INPUT" && textExitKeys.includes(event.code)) {
          event.nativeEvent.preventDefault();
          (active as HTMLInputElement).blur();
          settings.focus();
        }
      }
      return "native";
    },
  });
  const overlay = (handler: RemoteKeyHandler) =>
    createInputScope({
      isActive: handler.isActive,
      subscribe: handler.subscribe,
      handle(event) {
        if (event.phase === "down") {
          handler.keydown(event.code, event.nativeEvent);
        }
        return "native";
      },
    });
  const homeScope = createInputScope({
    onCancel: home.cancelInput,
    handle(event) {
      if (event.phase === "down") {
        home.keydown(event.code, event.nativeEvent);
      } else {
        home.keyup(event.code);
      }
      return "native";
    },
  });
  return [text, overlay(fireplace), overlay(inputs), settings.inputScope, homeScope];
};
