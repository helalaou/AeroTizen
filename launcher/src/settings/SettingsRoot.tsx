import { useStore } from '../shared/hooks/useStore';
import { Settings } from './Settings';
import { useSettingsEnvironment } from './hooks/useSettingsEnvironment';
import { useSettingsPresentation } from './hooks/useSettingsPresentation';

export const SettingsRoot = () => {
  const { view, root, settings, glass } = useSettingsEnvironment();
  const state = useStore(view);
  const values = useStore(settings), category = useStore(glass);
  useSettingsPresentation(state.open, state.previewing);
  return (
    <div id="editor" class={'sheet' + (values.glassSettings ? ' aero-settings-ready' + (!category.expanded ? ' aero-settings-collapsed' : '') : '')} hidden={!state.open} ref={root}>
      {state.mounted ? <Settings active={state.open} previewing={state.previewing} openedAt={state.openedAt} /> : null}
    </div>
  );
};
