import { useLayoutEffect, useRef } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import { useStore } from '../../shared/hooks/useStore';
import { categories } from '../glass/categories';
import { useSettingsEnvironment } from './useSettingsEnvironment';
import type { SettingsInventorySnapshot } from '../types';

interface Layout extends SettingsInventorySnapshot { continueEnabled: boolean; animated: boolean; locationLabel?: string; clockLayout?: string }
const SPACE_KEY = 32;

export const useSettingsNavigation = (active: boolean, previewing: boolean, { apps, inputs, continueSources, continueMessage, continueEnabled, animated, locationLabel, clockLayout }: Layout) => {
  const { navigation, bridge, services, actions, settings, view, root, glass, glassMenu, glassContent } = useSettingsEnvironment();
  const wasOpen = useRef(false);
  const previousScope = useRef('');
  const category = useStore(glass);
  useLayoutEffect(() => {
    if (active && !wasOpen.current && category.expanded) { glass.set({ ...category, expanded: false }); }
    navigation.invalidate();
    navigation.setScope?.(category.expanded ? glassContent.current : glassMenu.current);
    const scope = category.category + ':' + category.expanded;
    if (!wasOpen.current || previousScope.current !== scope) {
      const key = category.expanded ? glassContent.current?.querySelector('.aero-section-pane:not([hidden]) [data-key]')?.getAttribute('data-key') || 'settings-close' : 'section:' + category.category;
      navigation.reset(key);
    }
    previousScope.current = scope;
    wasOpen.current = active;
    if (active && !previewing) { navigation.focus(); } else { navigation.clear(); }
  }, [active, previewing, apps, inputs, continueSources, continueMessage, continueEnabled, animated, locationLabel, clockLayout, navigation, settings, category, glass, glassContent, glassMenu]);
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
        const current = navigation.current();
        if (!category.expanded) {
          event.preventDefault();
          if (code === K.BACK || code === K.ESC) { bridge.close(); }
          else if (code === K.RIGHT || code === K.ENTER || code === SPACE_KEY) { flushSync(() => glass.set({ ...category, expanded: true })); }
          else if (code === K.UP || code === K.DOWN) {
            const index = categories.findIndex(item => item.id === category.category);
            const next = categories[Math.max(0, Math.min(categories.length - 1, index + (code === K.UP ? -1 : 1)))];
            flushSync(() => glass.set({ category: next.id, expanded: false }));
          }
          return;
        }
        if ((code === K.BACK || code === K.ESC || code === K.LEFT && current &&
          current.getBoundingClientRect().left <= (glassContent.current?.getBoundingClientRect().left || 0) + 64) && !view.getSnapshot().adjusting) {
          event.preventDefault(); flushSync(() => glass.set({ ...category, expanded: false })); return;
        }
        if (view.getSnapshot().adjusting) {
          const setAdjusting = (adjusting: boolean) => flushSync(() => view.set({ ...view.getSnapshot(), adjusting }));
          if (current?.dataset.key === 'speed' && (code === K.LEFT || code === K.RIGHT)) {
            event.preventDefault(); actions.setSpeed(code === K.LEFT ? -1 : 1); return;
          }
          setAdjusting(false);
          // OK and Back only leave the slider; Up and Down leave it and move on.
          if (code === K.ENTER || code === K.BACK || code === K.ESC) { event.preventDefault(); return; }
        }
        if (code === K.BACK || code === K.ESC) { event.preventDefault(); bridge.close(); return; }
        if (code === K.ENTER || (code === SPACE_KEY && current?.getAttribute('role') === 'button')) {
          event.preventDefault(); current?.click(); return;
        }
        const direction = code === K.LEFT ? 'left' : code === K.RIGHT ? 'right' :
          code === K.UP ? 'up' : code === K.DOWN ? 'down' : undefined;
        if (direction) { event.preventDefault(); flushSync(() => navigation.move(direction)); }
      }
    });
    return () => { unregister(); window.removeEventListener('resize', resize); navigation.clear(); };
  }, [active, actions, bridge, navigation, root, services, view, category, glass, glassContent]);
};
