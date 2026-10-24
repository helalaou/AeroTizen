import { useLayoutEffect, useRef } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import { useSettingsEnvironment } from './useSettingsEnvironment';
import type { SettingsInventorySnapshot } from '../types';

interface Layout extends SettingsInventorySnapshot { animated: boolean; locationLabel?: string }
const SPACE_KEY = 32;

export const useSettingsNavigation = (active: boolean, previewing: boolean, { apps, inputs, animated, locationLabel }: Layout) => {
  const { navigation, bridge, services, actions, settings, view, root } = useSettingsEnvironment();
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    navigation.invalidate();
    if (active && !wasOpen.current) { navigation.reset('bg:' + settings.getSnapshot().background); }
    wasOpen.current = active;
    if (active && !previewing) { navigation.focus(); } else { navigation.clear(); }
  }, [active, previewing, apps, inputs, animated, locationLabel, navigation, settings]);
  useLayoutEffect(() => {
    if (!active) { return; }
    const resize = () => {
      navigation.invalidate();
      if (!view.getSnapshot().previewing) { flushSync(() => navigation.focus()); }
    };
    window.addEventListener('resize', resize);
    const unregister = bridge.register({
      focus: () => { flushSync(() => navigation.focus()); },
      blur: () => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && root.current?.contains(activeElement)) { activeElement.blur(); }
        navigation.clear();
      },
      keydown: (code, event) => {
        const K = services.config.KEY;
        if (view.getSnapshot().previewing) {
          event.preventDefault();
          flushSync(() => view.set({ ...view.getSnapshot(), previewing: false }));
          return;
        }
        if (code === K.BACK || code === K.ESC) { event.preventDefault(); bridge.close(); return; }
        const current = navigation.current();
        if (current?.dataset.key === 'speed' && (code === K.LEFT || code === K.RIGHT)) {
          event.preventDefault(); actions.setSpeed(code === K.LEFT ? -1 : 1); return;
        }
        if (code === K.ENTER || (code === SPACE_KEY && current?.getAttribute('role') === 'button')) {
          event.preventDefault(); current?.click(); return;
        }
        const direction = code === K.LEFT ? 'left' : code === K.RIGHT ? 'right' :
          code === K.UP ? 'up' : code === K.DOWN ? 'down' : undefined;
        if (direction) { event.preventDefault(); flushSync(() => navigation.move(direction)); }
      }
    });
    return () => { unregister(); window.removeEventListener('resize', resize); navigation.clear(); };
  }, [active, actions, bridge, navigation, root, services, view]);
};
