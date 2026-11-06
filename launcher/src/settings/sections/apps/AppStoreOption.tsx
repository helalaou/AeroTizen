import { CirclePlus } from "lucide-preact";

import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon";

import styles from "./AppStoreOption.module.css";
import { SettingsAppCard } from "./SettingsAppCard";

export const AppStoreOption = ({ onSelect }: { onSelect(): void }) => {
  const { t } = useTranslation();
  return (
    <SettingsAppCard class={styles.store} focusKey="add" onClick={onSelect}>
      <Icon icon={CirclePlus} class={styles.icon} />
      <div class={styles.label}>
        {t("apps.add")}
        <div class={styles.subtitle}>{t("apps.store")}</div>
      </div>
    </SettingsAppCard>
  );
};
