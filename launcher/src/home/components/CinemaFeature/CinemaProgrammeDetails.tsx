import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ContinueWatchingSourceBadge } from "../ContinueWatchingSourceBadge/ContinueWatchingSourceBadge";

import styles from "./CinemaFeature.module.css";
import type { ProgrammeProps } from "./useSelectedProgramme";
import { useSelectedProgramme } from "./useSelectedProgramme";

export const CinemaProgrammeDetails = ({ env, items }: ProgrammeProps) => {
  const { t } = useTranslation();
  const item = useSelectedProgramme({ env, items });
  if (!item) {
    return null;
  }
  return (
    <div class={styles.details} data-cinema-feature>
      <h1 class={styles.title}>{item.title}</h1>
      <div class={styles.source}>
        <ContinueWatchingSourceBadge env={env} item={item} placement="inline" />
        {item.season > 0 && item.episode > 0 && (
          <span class={styles.episode}>{t("continue.episode", { season: item.season, episode: item.episode })}</span>
        )}
      </div>
    </div>
  );
};
