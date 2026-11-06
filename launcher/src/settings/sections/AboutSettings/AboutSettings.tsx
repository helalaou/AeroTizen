import { useEffect } from "preact/hooks";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsHint } from "../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";

import styles from "./AboutSettings.module.css";

const updateCommand = "aerotizen update launcher";
const projectUrl = "github.com/helalaou/AeroTizen";

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
        <div class={styles.info}>
          <p class={styles.paragraph + " " + styles.lead}>{t("settings.about.tagline")}</p>
          <p class={styles.paragraph}>{t("settings.about.summary")}</p>
          <dl class={styles.facts} data-about-facts>
            <dt class={styles.term}>{t("settings.about.licenseLabel")}</dt>
            <dd class={styles.definition}>{t("settings.about.licenseValue")}</dd>
            <dt class={styles.term}>{t("settings.about.madeByLabel")}</dt>
            <dd class={styles.definition}>{t("settings.about.madeByValue")}</dd>
            <dt class={styles.term}>{t("settings.about.project")}</dt>
            <dd class={styles.definition}>
              <code>{projectUrl}</code>
            </dd>
            <dt class={styles.term}>{t("settings.about.feedbackLabel")}</dt>
            <dd class={styles.definition}>{t("settings.about.feedbackValue")}</dd>
          </dl>
          <p class={styles.paragraph + " " + styles.community}>{t("settings.about.community")}</p>
        </div>
        {releaseNotes.length > 0 && (
          <div class={styles.releaseNotes} data-release-notes>
            <h4 class={styles.notesTitle}>{t("settings.about.whatsNew")}</h4>
            <ul class={styles.list}>
              {releaseNotes.map((note, index) => (
                <li key={index} class={styles.listItem}>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SettingsSection>
      {latestVersion && (
        <SettingsHint class={styles.command} data-update-command>
          {t("settings.about.runOnComputer")}
          <br />
          <code>{updateCommand}</code>
        </SettingsHint>
      )}
    </>
  );
};
