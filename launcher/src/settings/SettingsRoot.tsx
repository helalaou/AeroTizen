import { useStore } from '../shared/hooks/useStore';
import { Settings } from './Settings';
import { useSettingsEnvironment } from './hooks/useSettingsEnvironment';
import { useSettingsPresentation } from './hooks/useSettingsPresentation';

export const SettingsRoot = () => {
  const { view, root } = useSettingsEnvironment();
  const state = useStore(view);
  useSettingsPresentation(state.open, state.previewing);
  return (
    <div id="editor" class="sheet" hidden={!state.open} ref={root}>
      {state.mounted ? <Settings active={state.open} previewing={state.previewing} openedAt={state.openedAt} /> : null}
    </div>
  );
};
