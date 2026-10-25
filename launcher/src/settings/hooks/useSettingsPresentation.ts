import { useLayoutEffect } from 'preact/hooks';
import { useSettingsEnvironment } from './useSettingsEnvironment';

// One owner for shell classes and the preview message, including close/unmount.
export const useSettingsPresentation = (open: boolean, previewing: boolean) => {
  const { services } = useSettingsEnvironment();
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
