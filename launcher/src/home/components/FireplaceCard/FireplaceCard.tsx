import { useTranslation } from "../../../shared/i18n/useTranslation";
import { FlameIcon } from "../../../shared/icons/FlameIcon";
import type { HomeEnvironment } from "../../types";
import { HomeAppCard } from "../HomeAppCard/HomeAppCard";

import styles from "./FireplaceCard.module.css";

export const FireplaceCard = ({ env, registered }: { env: HomeEnvironment; registered: boolean }) => {
  const { t } = useTranslation();
  const id = env.runtime.config.FIREPLACE_ID;
  return (
    <HomeAppCard env={env} id={id} registered={registered} className={styles.card} title={t("common.fireplace")}>
      <FlameIcon class={styles.flame} />
    </HomeAppCard>
  );
};
