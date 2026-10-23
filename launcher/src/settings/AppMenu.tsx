import { AppTile } from './AppTile';
import type { InstalledApp, SettingsActions, Tiles } from './types';

interface Props {
  home: readonly string[];
  apps: readonly InstalledApp[];
  actions: SettingsActions;
  tiles: Tiles;
  fireplaceId: string;
}

export const AppMenu = ({ home, apps, actions, tiles, fireplaceId }: Props) => {
  return (
    <>
      <h3>Show in app menu</h3>
      <p class="hint">Press OK to show or hide a tile on the home screen. On the home screen, hold OK on a tile to move it.</p>
      <div id="all-apps" class="grid">
        <div class="tile addapps" data-key="add" role="button" onClick={actions.openStore}>
          <span dangerouslySetInnerHTML={{ __html: tiles.ICONS.plus }} />
          <div class="name">Add apps<div class="sub">Samsung app store</div></div>
        </div>
        {[{ id: fireplaceId, name: 'Fireplace' }].concat(apps).map(app => (
          <AppTile key={app.id} app={app} selected={home.indexOf(app.id) >= 0}
            actions={actions} tiles={tiles} fireplaceId={fireplaceId} />
        ))}
      </div>
    </>
  );
};
