import { useStore } from "../../shared/hooks/useStore";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";
import { useSettingsPresentation } from "../hooks/useSettingsPresentation";
import { SettingsContent } from "../SettingsContent";

import styles from "./SettingsRoot.module.css";

export const SettingsRoot = () => {
  const { view, root } = useSettingsEnvironment();
  const state = useStore(view);
  useSettingsPresentation(state.open, state.previewing);
  return (
    <div
      id="editor"
      class={styles.overlay}
      data-settings-drawer="overlay"
      data-colour-picker-open={state.colourPicker ? "true" : undefined}
      data-previewing={state.previewing ? "true" : undefined}
      hidden={!state.open}
      ref={root}
    >
      {state.mounted ? (
        <SettingsContent active={state.open} previewing={state.previewing} openedAt={state.openedAt} />
      ) : null}
    </div>
  );
};
