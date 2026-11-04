import { useEffect } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { SettingsSection } from "../components/SettingsSection";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";

const updateCommand = "aerotizen update launcher";

export const AboutSettings = ({ active }: { active: boolean }) => {
  const { updates, drawer } = useSettingsEnvironment();
  const { t } = useTranslation();
  const { installedVersion, latestVersion, releaseNotes, unread } = useStore(updates);
  const state = useStore(drawer);
  useEffect(() => {
    // Reopening Settings can collapse the drawer before this effect runs.
    if (active && unread && state.category === "about" && state.expanded && drawer.getSnapshot() === state) {
      updates.acknowledge();
    }
  }, [active, drawer, state, unread, updates]);
  return (
    <>
      <SettingsSection
        title={t("settings.about.installedVersion", { version: installedVersion })}
        description={latestVersion ? t("settings.about.updateVersion", { version: latestVersion }) : undefined}
      >
        {releaseNotes.length > 0 && (
          <div class="about-release-notes">
            <h4>{t("settings.about.whatsNew")}</h4>
            <ul>
              {releaseNotes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </SettingsSection>
      {latestVersion && (
        <p class="hint about-update-command">
          {t("settings.about.runOnComputer")}
          <br />
          <code>{updateCommand}</code>
        </p>
      )}
    </>
  );
};
