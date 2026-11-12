import type { InputsService } from "../contracts/inputs";
import type { LauncherConfig, RemoteKeyHandler } from "../contracts/launcher";

export const createInputPlaybackKeyHandler = (
  keys: Pick<LauncherConfig["KEY"], "ENTER" | "BACK" | "ESC">,
  inputs: Pick<InputsService, "getSnapshot" | "leave">,
): RemoteKeyHandler => ({
  isActive: () => inputs.getSnapshot().playback !== "idle",
  keydown(code, event) {
    if (code === keys.ENTER || code === keys.BACK || code === keys.ESC) {
      event.preventDefault();
      inputs.leave();
    }
  },
});
