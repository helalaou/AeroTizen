import { useLayoutEffect, useRef } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import type { JSX } from 'preact';
import { useSettingsEnvironment } from './useSettingsEnvironment';

export const useSettingsNavigation = (active: boolean, previewing: boolean) => {
  const { navigation, bridge, services, actions, settings, view, root } = useSettingsEnvironment();
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    navigation.invalidate();
    if (active && !wasOpen.current) { navigation.reset('bg:' + settings.getSnapshot().background); }
    wasOpen.current = active;
    if (active && !previewing) { navigation.focus(); } else { navigation.clear(); }
  });
  useLayoutEffect(() => {
    if (!active) { return; }
    const resize = () => { navigation.invalidate(); if (!view.getSnapshot().previewing) { navigation.focus(); } };
    window.addEventListener('resize', resize);
    const unregister = bridge.register({
      focus: () => { navigation.focus(); },
      blur: () => { root.current?.querySelector<HTMLInputElement>('input:focus')?.blur(); navigation.clear(); },
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
        if (code === K.ENTER) { event.preventDefault(); current?.click(); return; }
        const direction = code === K.LEFT ? 'left' : code === K.RIGHT ? 'right' :
          code === K.UP ? 'up' : code === K.DOWN ? 'down' : undefined;
        if (direction) { event.preventDefault(); navigation.move(direction); }
      }
    });
    return () => { unregister(); window.removeEventListener('resize', resize); navigation.clear(); };
  }, [active, actions, bridge, navigation, root, services, view]);
  const select = (event: JSX.TargetedEvent<HTMLDivElement, Event>) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-key]') : null;
    if (element) { navigation.select(element.dataset.key); navigation.focus(); }
  };
  return { onClickCapture: select, onFocusCapture: select };
};
