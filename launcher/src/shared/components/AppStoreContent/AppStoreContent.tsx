import { CirclePlus } from "lucide-preact";

import { useTranslation } from "../../i18n/useTranslation";
import { Icon } from "../../icons/Icon/Icon";

import styles from "./AppStoreContent.module.css";

export const AppStoreContent = ({ variant }: { variant: "home" | "settings" }) => {
  const { t } = useTranslation();
  return (
    <div class={styles.content + " " + styles[variant]} data-app-store-content={variant}>
      <Icon icon={CirclePlus} class={styles.icon} data-app-store-part="icon" />
      <div class={styles.label} data-app-store-part="label">
        {t("apps.add")}
        <div class={styles.subtitle} data-app-store-part="subtitle">
          {t("apps.store")}
        </div>
      </div>
    </div>
  );
};
