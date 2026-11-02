import type { InstalledApp, SettingsActions, SettingsServices } from "../../types";

import { AddAppsTile } from "./AddAppsTile";
import { AppTile } from "./AppTile";
import { FireplaceTile } from "./FireplaceTile";

interface Props {
  actions: SettingsActions;
  active: boolean;
  apps: readonly InstalledApp[];
  describeApp: SettingsServices["describeApp"];
  fireplaceId: string;
  home: readonly string[];
}

export const AppMenu = ({ home, apps, actions, describeApp, fireplaceId, active }: Props) => (
  <>
    <h3>Show in app menu</h3>
    <p class="hint">
      Press OK to show or hide a tile on the home screen. On the home screen, hold OK on a tile to move it.
    </p>
    <div id="all-apps" class="grid">
      <AddAppsTile onSelect={actions.openStore} />
      <FireplaceTile
        id={fireplaceId}
        selected={home.includes(fireplaceId)}
        onSelect={() => actions.toggleApp(fireplaceId)}
      />
      {apps.map((app) => (
        <AppTile
          key={app.id}
          app={app}
          selected={home.includes(app.id)}
          active={active}
          onSelect={() => actions.toggleApp(app.id)}
          describeApp={describeApp}
        />
      ))}
    </div>
  </>
);
