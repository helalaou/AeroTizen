import type { ContinueSource } from "../../../contracts/launcher";
import type { MessageKey } from "../../../shared/i18n/catalogues";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsField } from "../../components/SettingsField/SettingsField";
import { SettingsHint } from "../../components/SettingsHint/SettingsHint";
import { SettingsToggle } from "../../components/SettingsToggle/SettingsToggle";
import type { SettingsSectionProps, SettingsServices } from "../../types";
import { AppOption } from "../apps/AppOption/AppOption";

import styles from "./ContinueWatchingSettings.module.css";

interface Props extends SettingsSectionProps {
  active: boolean;
  describeApp: SettingsServices["describeApp"];
  message: MessageKey | "";
  sources: readonly ContinueSource[];
}

export const ContinueWatchingSettings = ({ settings, actions, sources, message, active, describeApp }: Props) => {
  const { t } = useTranslation();
  return (
    <section class={styles.section} aria-label={t("continue.settings")}>
      <SettingsField title={t("home.continueWatching")} description={t("continue.hint")}>
        <SettingsToggle
          focusKey="continue-watching"
          label={t("home.continueWatching")}
          checked={settings.continueWatching === true}
          onChange={actions.setContinueWatching}
        />
      </SettingsField>
      {settings.continueWatching && (
        <>
          <SettingsField title={t("continue.showHeading")}>
            <SettingsToggle
              focusKey="continue-watching-heading-visibility"
              label={t("continue.showHeading")}
              checked={settings.showContinueWatchingHeading}
              onChange={actions.setContinueWatchingHeadingVisible}
            />
          </SettingsField>
          <SettingsField title={t("continue.coverArt")}>
            <SettingsToggle
              focusKey="continue-watching-cover-art"
              label={t("continue.coverArt")}
              checked={settings.continueWatchingCoverArt}
              onChange={actions.setContinueWatchingCoverArt}
            />
          </SettingsField>
          {sources.length > 0 && <SettingsHint class={styles.hint}>{t("continue.chooseApps")}</SettingsHint>}
          {message && (
            <SettingsHint class={styles.hint} role="status">
              {t(message)}
            </SettingsHint>
          )}
          <div class={styles.apps}>
            {sources.map((source) => (
              <AppOption
                key={source.id}
                app={source}
                focusKey={"continue-app:" + source.id}
                variant="source"
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
};
