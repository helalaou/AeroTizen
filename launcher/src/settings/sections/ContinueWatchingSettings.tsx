import { Choice } from '../components/Choice';
import { AppTile } from './apps/AppTile';
import type { ContinueSource, SettingsSectionProps, SettingsServices } from '../types';

interface Props extends SettingsSectionProps {
  sources: readonly ContinueSource[]; message: string; active: boolean; describeApp: SettingsServices['describeApp'];
}

export const ContinueWatchingSettings = ({ settings, actions, sources, message, active, describeApp }: Props) => (
  <section aria-label="Continue Watching settings">
    <h3>Continue Watching</h3>
    <p class="hint">Show saved programmes from the apps you choose. Shared lists can differ from the app.</p>
    <Choice id="continue-watching" label="Continue Watching" value={settings.continueWatching === true}
      options={[[false, 'Off'], [true, 'On']]} onSelect={actions.setContinueWatching} />
    {settings.continueWatching && <>
      <p class="hint">Choose apps below. Lists update when you return to AeroTizen.</p>
      {message && <p class="hint" role="status">{message}</p>}
      <div class="grid continue-apps">
        {sources.map(source => <AppTile key={source.id} app={source} focusKey={'continue-app:' + source.id}
          className="continue-option" selected={settings.continueWatchingApps.includes(source.id)} active={active}
          disabled={!source.storeId} onSelect={() => actions.toggleContinueApp(source.id)} describeApp={describeApp} />)}
      </div>
    </>}
  </section>
);
