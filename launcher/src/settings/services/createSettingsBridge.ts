import type { NavigationHandlers, SettingsBridge } from "../../contracts/launcher";
import type { MutableStore } from "../../shared/state/createStore";
import type { SettingsServices, ViewState } from "../types";

// Compatibility with the existing app key router. Rendering is subscribed to the
// stores; this bridge never builds markup or requests a root render.
export const createSettingsBridge = (
  view: MutableStore<ViewState>,
  services: SettingsServices,
  transaction: (action: () => void) => void,
  now: () => number = Date.now,
): SettingsBridge => {
  let handlers: NavigationHandlers | undefined;
  return {
    open() {
      transaction(() => {
        const current = view.getSnapshot();
        if (!current.open) {
          services.clearHomeFocus();
        }
        view.set({
          open: true,
          previewing: false,
          mounted: true,
          adjusting: false,
          colourPicker: null,
          openedAt: current.open ? current.openedAt : now(),
        });
      });
    },
    close() {
      transaction(() => {
        handlers?.blur();
        view.set({ ...view.getSnapshot(), open: false, previewing: false, adjusting: false, colourPicker: null });
        services.finishEditing();
      });
    },
    isOpen: () => view.getSnapshot().open,
    focus: () => {
      handlers?.focus();
    },
    keydown: (code, event) => {
      handlers?.keydown(code, event);
    },
    register(next) {
      handlers = next;
      return () => {
        if (handlers === next) {
          handlers = undefined;
        }
      };
    },
  };
};
