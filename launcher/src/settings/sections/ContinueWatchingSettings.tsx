import type { ContinueSource } from "../../contracts/launcher";
import { ChoiceGroup } from "../components/ChoiceGroup";
import type { SettingsSectionProps, SettingsServices } from "../types";

import { AppOption } from "./apps/AppOption";

const CONTINUE_WATCHING_OPTIONS = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
] as const;

interface Props extends SettingsSectionProps {
  active: boolean;
  describeApp: SettingsServices["describeApp"];
  message: string;
  sources: readonly ContinueSource[];
}

export const ContinueWatchingSettings = ({ settings, actions, sources, message, active, describeApp }: Props) => (
  <section aria-label="Continue Watching settings">
    <h3>Continue Watching</h3>
    <p class="hint">Show saved programmes from the apps you choose. Shared lists can differ from the app.</p>
    <ChoiceGroup
      id="continue-watching"
      label="Continue Watching"
      value={settings.continueWatching === true}
      options={CONTINUE_WATCHING_OPTIONS}
      onSelect={actions.setContinueWatching}
    />
    {settings.continueWatching && (
      <>
        <p class="hint">Choose apps below. Lists update when you return to AeroTizen.</p>
        {message && (
          <p class="hint" role="status">
            {message}
          </p>
        )}
        <div class="grid continue-apps">
          {sources.map((source) => (
            <AppOption
              key={source.id}
              app={source}
              focusKey={"continue-app:" + source.id}
              className="continue-option"
              selected={settings.continueWatchingApps.includes(source.id)}
              active={active}
              disabled={!source.storeId}
              onSelect={() => actions.toggleContinueApp(source.id)}
              describeApp={describeApp}
            />
          ))}
        </div>
      </>
    )}
  </section>
);
