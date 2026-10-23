import type { MutableStore } from '../../shared/state/createStore';
import type { NavigationHandlers, SettingsBridge, SettingsServices, SettingsStore, ViewState } from '../types';

// Compatibility with the existing app key router. Rendering is subscribed to the
// stores; this bridge never builds markup or requests a root render.
export const createSettingsBridge = (
  settings: SettingsStore, view: MutableStore<ViewState>, services: SettingsServices,
  transaction: (action: () => void) => void
): SettingsBridge => {
  let handlers: NavigationHandlers | undefined;
  return {
    open() {
      settings.refresh();
      services.clearHomeFocus();
      transaction(() => view.set({ open: true, previewing: false, mounted: true }));
    },
    close() {
      handlers?.blur();
      transaction(() => view.set({ ...view.getSnapshot(), open: false, previewing: false }));
      services.finishEditing();
      settings.refresh();
    },
    isOpen: () => view.getSnapshot().open,
    focus: () => { handlers?.focus(); },
    keydown: (code, event) => { handlers?.keydown(code, event); },
    register(next) {
      handlers = next;
      return () => { if (handlers === next) { handlers = undefined; } };
    }
  };
};
