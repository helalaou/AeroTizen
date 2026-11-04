import type { InstalledApp } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { SettingsActions, SettingsServices } from "../../types";

import { AppOption } from "./AppOption";
import { AppStoreOption } from "./AppStoreOption";
import { FireplaceOption } from "./FireplaceOption";

interface Props {
  actions: SettingsActions;
  active: boolean;
  apps: readonly InstalledApp[];
  describeApp: SettingsServices["describeApp"];
  fireplaceId: string;
  home: readonly string[];
}

export const HomeAppsSettings = ({ home, apps, actions, describeApp, fireplaceId, active }: Props) => {
  const { t } = useTranslation();
  return (
    <>
      <h3>{t("apps.show")}</h3>
      <p class="hint">{t("apps.hint")}</p>
      <div id="all-apps" class="grid home-apps-settings">
        <AppStoreOption onSelect={actions.openStore} />
        <FireplaceOption
          id={fireplaceId}
          selected={home.includes(fireplaceId)}
          onSelect={() => actions.toggleApp(fireplaceId)}
        />
        {apps.map((app) => (
          <AppOption
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
};
