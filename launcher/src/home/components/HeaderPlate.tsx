import { useLayoutEffect, useState } from 'preact/hooks';
import { useStore } from '../../shared/hooks/useStore';
import type { HomeEnvironment } from '../types';

export const HeaderPlate = ({ env, tabs = false }: { env: HomeEnvironment; tabs?: boolean }) => {
  const state = useStore(env.state), settings = useStore(env.settings);
  const keys = tabs ? ['home-tab', 'apps-tab'] : ['gear', 'samsung-home-shortcut'];
  const focused = state.active && keys.includes(state.selected);
  const key = focused ? state.selected : tabs ? state.page + '-tab' : '';
  const [style, setStyle] = useState({ transform: '', width: '64px', height: '64px', left: '0px' });
  useLayoutEffect(() => {
    const node = env.nodes.get(key);
    if (node) { setStyle({ transform: 'translate3d(' + node.offsetLeft + 'px,0,0)', width: node.offsetWidth + 'px', height: node.offsetHeight + 'px', left: '0px' }); }
  }, [env, key, settings.glassSettings]);
  if (!settings.glassSettings) { return null; }
  return <div id={tabs ? 'aero-tab-glider' : 'aero-header-focus'} aria-hidden="true"
    class={(tabs || focused ? 'is-visible' : '') + (focused ? ' is-focused' : '')} style={style} />;
};
