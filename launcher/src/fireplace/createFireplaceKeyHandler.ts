import type { FireplaceControls } from "../contracts/fireplace";
import type { LauncherConfig, RemoteKeyHandler } from "../contracts/launcher";

export const createFireplaceKeyHandler = (
  keys: Pick<LauncherConfig["KEY"], "UP" | "DOWN" | "ENTER" | "BACK" | "ESC">,
  fireplace: Omit<FireplaceControls, "open">,
): RemoteKeyHandler => ({
  isActive: () => fireplace.isOpen(),
  keydown(code, event) {
    if (code === keys.UP) {
      fireplace.volumeUp();
    } else if (code === keys.DOWN) {
      fireplace.volumeDown();
    } else if (code === keys.ENTER || code === keys.BACK || code === keys.ESC) {
      event.preventDefault();
      fireplace.close();
    }
  },
});
