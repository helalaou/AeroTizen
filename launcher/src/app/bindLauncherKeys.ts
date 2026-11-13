import type { LauncherConfig } from "../contracts/launcher";
import type { InputScope } from "../contracts/remoteInput";
import { createInputDispatcher } from "../shared/input/createInputDispatcher";

export const bindLauncherKeys = (document: Document, keys: LauncherConfig["KEY"], scopes: readonly InputScope[]) => {
  const input = createInputDispatcher(keys, scopes);
  const window = document.defaultView;
  const keydown = (event: KeyboardEvent) => input.keydown(event.keyCode, event);
  const keyup = (event: KeyboardEvent) => input.keyup(event.keyCode, event);
  const cancel = () => input.cancel();
  const visibility = () => {
    if (document.hidden) {
      cancel();
    }
  };
  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", keyup);
  document.addEventListener("visibilitychange", visibility);
  window?.addEventListener("blur", cancel);
  return () => {
    document.removeEventListener("keydown", keydown);
    document.removeEventListener("keyup", keyup);
    document.removeEventListener("visibilitychange", visibility);
    window?.removeEventListener("blur", cancel);
    input.dispose();
  };
};
