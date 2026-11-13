import { useEffect } from "preact/hooks";

import type { LauncherUpdateCheck } from "../../../contracts/updates";
import { useStore } from "../../../shared/hooks/useStore";
import type { MessageKey } from "../../../shared/i18n/catalogues";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ChoiceOption } from "../../components/ChoiceOption/ChoiceOption";
import { SettingsHint } from "../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";

import styles from "./AboutSettings.module.css";

const updateCommand = "aerotizen update launcher";
const projectUrl = "github.com/helalaou/AeroTizen";
const CHECK_MESSAGES: Readonly<Record<LauncherUpdateCheck, MessageKey | null>> = {
  idle: null,
  checking: "settings.about.checking",
  current: "settings.about.upToDate",
  failed: "settings.about.checkFailed",
};

export const AboutSettings = ({ active }: { active: boolean }) => {
  const { updates, drawer } = useSettingsEnvironment();
  const { t } = useTranslation();
  const { check, installedVersion, latestVersion, releaseNotes, unread } = useStore(updates);
  const checkMessage = CHECK_MESSAGES[check];
  const state = useStore(drawer);
  useEffect(() => {
    // Reopening Settings can collapse the drawer before this effect runs.
    if (active && unread && state.category === "about" && state.expanded && drawer.getSnapshot() === state) {
      updates.acknowledge();
    }
  }, [active, drawer, state, unread, updates]);
  return (
    <SettingsSection title={t("settings.about.installedVersion", { version: installedVersion })}>
      <div class={styles.check}>
        <ChoiceOption
          id="about:check-updates"
          inline
          busy={check === "checking"}
          disabled={check === "checking"}
          onSelect={updates.checkNow}
        >
          {t("settings.about.checkForUpdates")}
        </ChoiceOption>
        <SettingsHint class={styles.checkStatus} role="status" data-update-check={check} hidden={!checkMessage}>
          {checkMessage && t(checkMessage)}
        </SettingsHint>
      </div>
      {latestVersion && (
        <div class={styles.update} data-launcher-update>
          <h4 class={styles.updateTitle}>{t("settings.about.updateVersion", { version: latestVersion })}</h4>
          {releaseNotes.length > 0 && (
            <div class={styles.releaseNotes} data-release-notes>
              <h5 class={styles.notesTitle}>{t("settings.about.whatsNew")}</h5>
              <ul class={styles.list}>
                {releaseNotes.map((note, index) => (
                  <li key={index} class={styles.listItem}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <SettingsHint class={styles.command} data-update-command>
            {t("settings.about.runOnComputer")}
            <code>{updateCommand}</code>
          </SettingsHint>
        </div>
      )}
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
    </SettingsSection>
  );
};
