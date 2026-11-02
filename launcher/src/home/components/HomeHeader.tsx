import { useStore } from "../../shared/hooks/useStore";
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
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"
              transform="translate(-1 0)"
            />
          </svg>
        </HomeControl>
        <HomeControl
          env={env}
          id="samsung-home-shortcut"
          controlKey="samsung-home-shortcut"
          className="icon-btn samsung-home-shortcut"
          title={env.translate("Use Samsung Home instead")}
        >
          <svg viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 11 12 3l9 8v10h-6v-7H9v7H3Z" />
          </svg>
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
