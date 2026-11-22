import { useLayoutEffect, useRef } from "preact/hooks";

import type { ContinueItem } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";
import { ContinueWatchingSourceBadge } from "../ContinueWatchingSourceBadge/ContinueWatchingSourceBadge";

import styles from "./CinemaFeature.module.css";
import { positionCinemaDetails } from "./positionCinemaDetails";

export const CinemaProgrammeDetails = ({ env, item }: { env: HomeEnvironment; item: ContinueItem }) => {
  const { t } = useTranslation();
  const details = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (details.current && env.continueItems.current && env.viewport.current) {
      return positionCinemaDetails(details.current, env.continueItems.current, env.viewport.current);
    }
  }, [env]);
  return (
    <div class={styles.details} data-cinema-feature ref={details}>
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
