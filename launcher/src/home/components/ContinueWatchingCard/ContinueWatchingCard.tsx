import { memo } from "preact/compat";
import { useState } from "preact/hooks";

import type { ContinueItem } from "../../../contracts/launcher";
import { cardArtwork } from "../../../shared/continueWatchingArtwork";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import text from "../../../shared/styles/text.module.css";
import type { HomeEnvironment } from "../../types";
import { ContinueWatchingSourceBadge } from "../ContinueWatchingSourceBadge/ContinueWatchingSourceBadge";
import { HomeControl } from "../HomeControl/HomeControl";

import styles from "./ContinueWatchingCard.module.css";

const MIN_PLAYBACK_SECONDS = 1;

interface Props {
  cinema?: boolean;
  env: HomeEnvironment;
  item: ContinueItem;
}

export const ContinueWatchingCard = memo(({ env, item, cinema = false }: Props) => {
  const { t } = useTranslation();
  const episode =
    item.season > 0 && item.episode > 0 ? t("continue.episode", { season: item.season, episode: item.episode }) : "";
  const [thumbnail, background, poster] = cardArtwork(item);
  const artwork = [useArtwork(thumbnail), useArtwork(background), useArtwork(poster)].find(({ src }) => src);
  const progress =
    item.duration > 0 && item.playback >= MIN_PLAYBACK_SECONDS
      ? Math.min(100, (item.playback / item.duration) * 100)
      : 0;
  return (
    <HomeControl
      env={env}
      controlKey={"continue:" + item.key}
      dataKey={item.key}
      dataAttributes={{ "data-cinema-card": cinema ? "true" : "false" }}
      className={styles.card}
      title={
        episode
          ? t("continue.episodeTitle", { title: item.title, episode, source: item.sourceName })
          : t("continue.itemTitle", { title: item.title, source: item.sourceName })
      }
    >
      <div class={styles.artwork} data-continue-part="artwork">
        {artwork?.src && (
          <img
            key={artwork.src}
            class={styles.image}
            data-continue-part="image"
            data-fit={artwork.fit}
            alt=""
            src={artwork.src}
            onError={artwork.onError}
          />
        )}
        {!cinema && <ContinueWatchingSourceBadge env={env} item={item} />}
      </div>
      {!cinema && (
        <>
          <div
            class={styles.progress}
            data-continue-part="progress"
            data-empty={progress > 0 ? "false" : "true"}
            aria-hidden="true"
          >
            {progress > 0 && (
              <div class={styles.progressFill} data-continue-part="progress-fill" style={{ width: progress + "%" }} />
            )}
          </div>
          <div class={styles.label} data-continue-part="label">
            <div class={styles.details}>
              <div
                class={styles.title + (episode ? " " + text.truncate : "")}
                data-continue-part="title"
                data-single-line={episode ? "true" : undefined}
              >
                {item.title}
              </div>
              {episode ? (
                <div class={styles.episode} data-continue-part="episode">
                  {episode}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </HomeControl>
  );
});

// Artwork errors are local to each keyed feed item; changing its URL permits retry.
const useArtwork = ({ src, fit }: ReturnType<typeof cardArtwork>[number]) => {
  const [failed, setFailed] = useState<string | undefined>();
  return { src: src === failed ? undefined : src, fit, onError: () => setFailed(src) };
};
