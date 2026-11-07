import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-preact";

import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon/Icon";

import styles from "./SettingsHelp.module.css";

export const SettingsHelp = () => {
  const { t } = useTranslation();
  return (
    <div class={styles.help} data-settings-help>
      <span class={styles.command}>
        <Icon icon={ChevronUp} class={styles.icon} />
        <Icon icon={ChevronDown} class={styles.icon} />
        {t("home.move")}
      </span>
      <span class={styles.command}>{t("settings.drawer.select")}</span>
      <span class={styles.command}>
        <Icon icon={ChevronLeft} class={styles.icon} mirrorInRtl />
        {t("settings.drawer.back")}
      </span>
    </div>
  );
};
