import { CirclePlus } from "lucide-preact";

import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon/Icon";
import { ADD_APPS_KEY } from "../../homeControls";
import type { HomeEnvironment } from "../../types";
import { HomeAppCard } from "../HomeAppCard/HomeAppCard";

import styles from "./AppStoreCard.module.css";

export const AppStoreCard = ({ env, registered }: { env: HomeEnvironment; registered: boolean }) => {
  const { t } = useTranslation();
  return (
    <HomeAppCard
      env={env}
      controlKey={ADD_APPS_KEY}
      registered={registered}
      className={styles.card}
      title={t("apps.add")}
    >
      <Icon icon={CirclePlus} class={styles.icon} />
      <div class={styles.label}>
        {t("apps.add")}
        <div class={styles.subtitle}>{t("apps.store")}</div>
      </div>
    </HomeAppCard>
  );
};
