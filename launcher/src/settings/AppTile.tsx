import { useLayoutEffect, useRef } from 'preact/hooks';
import type { InstalledApp, SettingsActions, Tiles } from './types';

interface Props {
  app: InstalledApp;
  selected: boolean;
  actions: SettingsActions;
  tiles: Tiles;
  fireplaceId: string;
}

// Keep the existing artwork loader alive. Copying innerHTML loses its asynchronous
// image callbacks. This bridge also gives Home and Settings the same fallback art.
export const AppTile = ({ app, selected, actions, tiles, fireplaceId }: Props) => {
  const host = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = app.id === fireplaceId ? tiles.card(app.name, tiles.ICONS.flame) : tiles.app(app);
    if (app.id === fireplaceId) {
      node.classList.add('fire');
    }
    node.dataset.key = 'app:' + app.id;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', app.name);
    node.onclick = () => actions.toggleApp(app.id);
    host.current?.appendChild(node);
    tile.current = node;
    return () => {
      node.onclick = null;
      node.remove();
    };
  }, [app.id, app.name, app.icon, app.storeId, actions, tiles, fireplaceId]);

  useLayoutEffect(() => {
    tile.current?.classList.toggle('on', selected);
    tile.current?.setAttribute('aria-pressed', String(selected));
  });

  return <div ref={host} />;
};
