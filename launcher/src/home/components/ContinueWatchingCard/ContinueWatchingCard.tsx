import { useMemo, useState } from "preact/hooks";

import type { ContinueItem } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import text from "../../../shared/styles/text.module.css";
import type { HomeEnvironment } from "../../types";
import { AppArtwork } from "../AppArtwork/AppArtwork";
import { HomeControl } from "../HomeControl/HomeControl";

import styles from "./ContinueWatchingCard.module.css";

const MIN_PLAYBACK_SECONDS = 1;

export const ContinueWatchingCard = ({ env, item }: { env: HomeEnvironment; item: ContinueItem }) => {
  const { t } = useTranslation();
  const app = useMemo(
    () => ({ id: item.sourceId, name: item.sourceName, icon: item.sourceIcon }),
    [item.sourceId, item.sourceName, item.sourceIcon],
  );
  const brand = useMemo(() => env.describe(app), [env, app]);
  const episode =
    item.season > 0 && item.episode > 0 ? t("continue.episode", { season: item.season, episode: item.episode }) : "";
  const thumbnail = useArtwork(item.thumbnailImage);
  const background = useArtwork(item.backgroundImage);
  const poster = useArtwork(item.image);
  const artwork = [thumbnail, background, poster].find((candidate) => candidate.src);
  const progress =
    item.duration > 0 && item.playback >= MIN_PLAYBACK_SECONDS
      ? Math.min(100, (item.playback / item.duration) * 100)
      : 0;
  return (
    <HomeControl
      env={env}
      controlKey={"continue:" + item.key}
      dataKey={item.key}
      className={styles.card}
      title={
        episode
          ? t("continue.episodeTitle", { title: item.title, episode, source: item.sourceName })
          : t("continue.itemTitle", { title: item.title, source: item.sourceName })
      }
    >
      <div class={styles.artwork} data-continue-part="artwork">
        {artwork && (
          <img
            key={artwork.src}
            class={styles.image}
            data-continue-part="image"
            data-fit={artwork === poster ? "contain" : "cover"}
            alt=""
            src={artwork.src}
            onError={artwork.onError}
          />
        )}
        <div
          class={styles.sourceBadge}
          data-continue-part="source-badge"
          aria-hidden="true"
          style={{ "--app-background": brand.background }}
        >
          <AppArtwork app={app} brand={brand} active variant="badge" />
        </div>
      </div>
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
    </HomeControl>
  );
};
// Artwork errors are local to each keyed feed item; changing its URL permits retry.
const useArtwork = (url?: string) => {
  const [failed, setFailed] = useState<string | undefined>();
  return { src: url === failed ? undefined : url, onError: () => setFailed(url) };
};
