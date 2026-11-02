import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { useStore } from '../../shared/hooks/useStore';
import { useSettingsEnvironment } from '../hooks/useSettingsEnvironment';

export const FocusPlate = ({ container, sidebar = false }: { container: RefObject<HTMLDivElement>; sidebar?: boolean }) => {
  const { navigation, glass } = useSettingsEnvironment(), key = useStore(navigation), state = useStore(glass);
  const [style, setStyle] = useState({ transform: '', width: '0px', height: '0px', borderRadius: '17px' });
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const host = container.current, target = navigation.current();
    if (!host || !target || !host.contains(target)) { setVisible(false); return; }
    const rect = target.getBoundingClientRect(), parent = host.getBoundingClientRect();
    setStyle({ transform: 'translate3d(' + (rect.left - parent.left + host.scrollLeft) + 'px,' +
      (rect.top - parent.top + host.scrollTop) + 'px,0)', width: rect.width + 'px', height: rect.height + 'px', borderRadius: getComputedStyle(target).borderRadius });
    setVisible(Boolean(rect.width && rect.height));
  }, [container, key, navigation, state]);
  return <div aria-hidden="true" class={(sidebar ? 'aero-settings-glider' : 'aero-content-glider') + (visible ? ' is-visible' : '')} style={style} />;
};
