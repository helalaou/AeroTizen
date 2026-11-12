import type { HomeBridge, LauncherConfig, RemoteKeyHandler, SettingsBridge } from "../contracts/launcher";

interface KeyTargets {
  fireplace: RemoteKeyHandler;
  home: Pick<HomeBridge, "keydown" | "keyup">;
  inputs: RemoteKeyHandler;
  settings: Pick<SettingsBridge, "focus" | "isOpen" | "keydown">;
}

export const bindLauncherKeys = (
  document: Document,
  keys: LauncherConfig["KEY"],
  { fireplace, home, inputs, settings }: KeyTargets,
) => {
  const finishesTextEntry = (code: number) =>
    code === keys.ENTER ||
    code === keys.BACK ||
    code === keys.ESC ||
    code === keys.IME_DONE ||
    code === keys.IME_CANCEL;
  const keydown = (event: KeyboardEvent) => {
    const code = event.keyCode;
    const active = document.activeElement;
    // The on-screen keyboard owns text entry. OK, Done and Back return focus to Settings.
    if (active?.tagName === "INPUT") {
      if (finishesTextEntry(code)) {
        event.preventDefault();
        (active as HTMLInputElement).blur();
        settings.focus();
      }
      return;
    }
    if (fireplace.isActive()) {
      fireplace.keydown(code, event);
      return;
    }
    if (inputs.isActive()) {
      inputs.keydown(code, event);
      return;
    }
    if (settings.isOpen()) {
      settings.keydown(code, event);
      return;
    }
    home.keydown(code, event);
  };
  const keyup = (event: KeyboardEvent) => {
    if (!settings.isOpen() && !inputs.isActive() && !fireplace.isActive()) {
      home.keyup(event.keyCode);
    }
  };

  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", keyup);
  return () => {
    document.removeEventListener("keydown", keydown);
    document.removeEventListener("keyup", keyup);
  };
};
