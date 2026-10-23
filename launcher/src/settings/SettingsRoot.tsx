import { useLayoutEffect } from 'preact/hooks';
import { useStore } from '../shared/hooks/useStore';
import { Settings } from './Settings';
import { useSettingsEnvironment } from './hooks/useSettingsEnvironment';

export const SettingsRoot = () => {
  const { view, root, services } = useSettingsEnvironment();
  const state = useStore(view);
  useLayoutEffect(() => {
    document.body.classList.toggle('editing', state.open);
    document.body.classList.toggle('previewing', state.previewing);
    if (!state.open) { services.hidePreviewMessage(); }
    return () => { document.body.classList.remove('editing', 'previewing'); };
  }, [state.open, state.previewing, services]);
  useLayoutEffect(() => () => { services.hidePreviewMessage(); }, [services]);
  return (
    <div id="editor" class="sheet" hidden={!state.open} ref={root}>
      {state.mounted ? <Settings active={state.open} previewing={state.previewing} /> : null}
    </div>
  );
};
