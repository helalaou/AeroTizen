import { House, Settings } from "lucide-preact";

import { useStore } from "../../shared/hooks/useStore";
import { Icon } from "../../shared/icons/Icon";
import { HeaderStatus } from "../../status/HeaderStatus";
import { NetworkStatus } from "../../status/NetworkStatus";
import type { HomeEnvironment } from "../types";

import { HeaderFocusIndicator } from "./HeaderFocusIndicator";
import { HomeControl } from "./HomeControl";

export const HomeHeader = ({ env }: { env: HomeEnvironment }) => {
  const { page, active } = useStore(env.state);
  return (
    <header class="topbar" aria-hidden={!active}>
      <div class="topbar-left">
        <HeaderFocusIndicator env={env} />
        <HomeControl
          env={env}
          id="gear"
          controlKey="gear"
          className="icon-btn"
          preserveSelection
          title={env.translate("Settings")}
        >
          <Icon icon={Settings} />
        </HomeControl>
        <HomeControl
          env={env}
          id="samsung-home-shortcut"
          controlKey="samsung-home-shortcut"
          className="icon-btn samsung-home-shortcut"
          title={env.translate("Use Samsung Home instead")}
        >
          <Icon icon={House} />
        </HomeControl>
        <NetworkStatus status={env.status} translate={env.translate} />
      </div>
      <nav class="view-tabs" aria-label="App views">
        <HeaderFocusIndicator env={env} group="tabs" />
        <HomeControl
          env={env}
          id="home-tab"
          controlKey="home-tab"
          className={"view-tab" + (page === "home" ? " active" : "")}
          title={env.translate("Home")}
          pressed={page === "home"}
        >
          {env.translate("Home")}
        </HomeControl>
        <HomeControl
          env={env}
          id="apps-tab"
          controlKey="apps-tab"
          className={"view-tab" + (page === "apps" ? " active" : "")}
          title={env.translate("All apps")}
          pressed={page === "apps"}
        >
          {env.translate("All apps")}
        </HomeControl>
      </nav>
      <HeaderStatus settings={env.settings} status={env.status} clock={env.runtime.clock} translate={env.translate} />
    </header>
  );
};
