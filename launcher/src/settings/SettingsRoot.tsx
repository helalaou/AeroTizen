import { useStore } from "../shared/hooks/useStore";

import { useSettingsEnvironment } from "./hooks/useSettingsEnvironment";
import { useSettingsPresentation } from "./hooks/useSettingsPresentation";
import { SettingsContent } from "./SettingsContent";

export const SettingsRoot = () => {
  const { view, root, settings, drawer } = useSettingsEnvironment();
  const state = useStore(view);
  const values = useStore(settings);
  const category = useStore(drawer);
  useSettingsPresentation(state.open, state.previewing);
  return (
    <div
      id="editor"
      class={
        "sheet settings-drawer" +
        (values.glassSettings ? " settings-drawer--glass" : " settings-drawer--classic") +
        (!category.expanded ? " settings-drawer--collapsed" : "")
      }
      hidden={!state.open}
      ref={root}
    >
      {state.mounted ? (
        <SettingsContent active={state.open} previewing={state.previewing} openedAt={state.openedAt} />
      ) : null}
    </div>
  );
};
