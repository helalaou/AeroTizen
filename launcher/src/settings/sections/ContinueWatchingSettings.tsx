import type { ContinueSource } from "../../contracts/launcher";
import type { MessageKey } from "../../shared/i18n/catalogues";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { SettingsSection } from "../components/SettingsSection";
import type { SettingsSectionProps, SettingsServices } from "../types";

import { AppOption } from "./apps/AppOption";

const CONTINUE_WATCHING_OPTIONS = [
  { value: false, labelKey: "common.off" },
  { value: true, labelKey: "common.on" },
] as const;

interface Props extends SettingsSectionProps {
  active: boolean;
  describeApp: SettingsServices["describeApp"];
  message: MessageKey | "";
  sources: readonly ContinueSource[];
}

export const ContinueWatchingSettings = ({ settings, actions, sources, message, active, describeApp }: Props) => {
  const { t } = useTranslation();
  return (
    <SettingsSection title={t("home.continueWatching")} description={t("continue.hint")} label={t("continue.settings")}>
      <ChoiceGroup
        id="continue-watching"
        label={t("home.continueWatching")}
        value={settings.continueWatching === true}
        options={CONTINUE_WATCHING_OPTIONS}
        onSelect={actions.setContinueWatching}
      />
      {settings.continueWatching && (
        <>
          {sources.length > 0 && <p class="hint">{t("continue.chooseApps")}</p>}
          {message && (
            <p class="hint" role="status">
              {t(message)}
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
    </SettingsSection>
  );
};
