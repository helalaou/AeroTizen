import { useLayoutEffect } from 'preact/hooks';
import { useStore } from '../../shared/hooks/useStore';
import { useSettingsEnvironment } from './useSettingsEnvironment';

// One owner for shell classes and the preview message, including close/unmount.
export const useSettingsPresentation = (open: boolean, previewing: boolean) => {
  const { services, settings } = useSettingsEnvironment();
  const values = useStore(settings);
  useLayoutEffect(() => { document.body.classList.toggle('glass-ui', values.glassSettings === true); return () => document.body.classList.remove('glass-ui'); }, [values.glassSettings]);
  useLayoutEffect(() => {
    document.body.classList.toggle('editing', open);
    document.body.classList.toggle('previewing', open && previewing);
    if (open && previewing) { services.showPreviewMessage(); } else { services.hidePreviewMessage(); }
  }, [open, previewing, services]);
  useLayoutEffect(() => () => {
    document.body.classList.remove('editing', 'previewing');
    services.hidePreviewMessage();
  }, [services]);
};
