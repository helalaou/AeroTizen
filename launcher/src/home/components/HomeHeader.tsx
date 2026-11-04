import { House, Settings } from "lucide-preact";

import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { Icon } from "../../shared/icons/Icon";
import { HeaderStatus } from "../../status/HeaderStatus";
import { NetworkStatus } from "../../status/NetworkStatus";
import type { HomeEnvironment } from "../types";

import { HeaderFocusIndicator } from "./HeaderFocusIndicator";
import { HomeControl } from "./HomeControl";

export const HomeHeader = ({ env }: { env: HomeEnvironment }) => {
  const { t } = useTranslation();
  const { page, active } = useStore(env.state);
  const { unread } = useStore(env.updates);
  const settingsTitle = t(unread ? "settings.about.homeNotice" : "common.settings");
  return (
    <header class="topbar" aria-hidden={!active}>
      <div class="topbar-left">
        <HeaderFocusIndicator env={env} />
        <HomeControl env={env} id="gear" controlKey="gear" className="icon-btn" preserveSelection title={settingsTitle}>
          <Icon icon={Settings} />
          {unread && <span class="home-update-dot" aria-hidden="true" />}
        </HomeControl>
        <HomeControl
          env={env}
          id="samsung-home-shortcut"
          controlKey="samsung-home-shortcut"
          className="icon-btn samsung-home-shortcut"
          title={t("common.samsungHome")}
        >
          <Icon icon={House} />
        </HomeControl>
        <NetworkStatus status={env.status} />
      </div>
      <nav class="view-tabs" aria-label={t("home.views")}>
        <HeaderFocusIndicator env={env} group="tabs" />
        <HomeControl
          env={env}
          id="home-tab"
          controlKey="home-tab"
          className={"view-tab" + (page === "home" ? " active" : "")}
          title={t("home.home")}
          pressed={page === "home"}
        >
          {t("home.home")}
        </HomeControl>
        <HomeControl
          env={env}
          id="apps-tab"
          controlKey="apps-tab"
          className={"view-tab" + (page === "apps" ? " active" : "")}
          title={t("home.allApps")}
          pressed={page === "apps"}
        >
          {t("home.allApps")}
        </HomeControl>
      </nav>
      <HeaderStatus settings={env.settings} status={env.status} clock={env.runtime.clock} />
    </header>
  );
};
