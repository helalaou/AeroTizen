import { memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";

import type { ContinueItem } from "../../../contracts/launcher";
import { cardArtwork } from "../../../shared/continueWatchingArtwork";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import text from "../../../shared/styles/text.module.css";
import type { HomeEnvironment } from "../../types";
import { ContinueWatchingSourceBadge } from "../ContinueWatchingSourceBadge/ContinueWatchingSourceBadge";
import { HomeControl } from "../HomeControl/HomeControl";

import styles from "./ContinueWatchingCard.module.css";
import { observeArtworkVisibility } from "./observeArtworkVisibility";

const MIN_PLAYBACK_SECONDS = 1;

interface Props {
  coverArt?: boolean;
  env: HomeEnvironment;
  item: ContinueItem;
  showDetails?: boolean;
  visible?: boolean;
}

export const ContinueWatchingCard = memo(
  ({ coverArt = false, env, item, showDetails = true, visible = true }: Props) => {
    const { t } = useTranslation();
    const episode =
      item.season > 0 && item.episode > 0 ? t("continue.episode", { season: item.season, episode: item.episode }) : "";
    const artworkNode = useRef<HTMLDivElement>(null);
    const service = env.runtime.continueWatching;
    const [resolvedPoster, setResolvedPoster] = useState<{ item: ContinueItem; url?: string }>();
    const watchPoster = coverArt && visible ? service?.watchPoster : undefined;
    useEffect(() => {
      const node = artworkNode.current;
      if (!node || !watchPoster) {
        setResolvedPoster(undefined);
        return;
      }
      let stop: (() => void) | undefined;
      let resolved = false;
      const unobserve = observeArtworkVisibility(node, (inView) => {
        if (!inView) {
          stop?.();
          stop = undefined;
        } else if (!resolved && !stop) {
          stop = watchPoster(item, (result) => {
            if (result.status === "ready") {
              resolved = true;
              setResolvedPoster({ item, url: result.url });
            }
          });
        }
      });
      return () => {
        unobserve();
        stop?.();
      };
    }, [item, watchPoster]);

    const poster = resolvedPoster?.item === item ? resolvedPoster : undefined;
    const cover = useArtwork({ src: coverArt ? poster?.url : undefined, fit: "cover" });
    const [thumbnail, background, sourcePoster] = cardArtwork(item);
    const source = [useArtwork(thumbnail), useArtwork(background), useArtwork(sourcePoster)].find(({ src }) => src);
    const artwork = cover.src ? cover : source;
    const awaitingPoster = watchPoster && !poster;
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
        <div class={styles.artwork} data-continue-part="artwork" ref={artworkNode}>
          {!awaitingPoster && artwork?.src && (
            <img
              key={artwork.src}
              class={styles.image}
              data-continue-part="image"
              data-fit={coverArt && !cover.src ? "contain" : artwork.fit}
              alt=""
              src={artwork.src}
              onError={artwork.onError}
            />
          )}
          {showDetails && <ContinueWatchingSourceBadge env={env} item={item} />}
        </div>
        {showDetails && (
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
  },
);

// Artwork errors are local to each keyed feed item; changing its URL permits retry.
const useArtwork = ({ src, fit }: ReturnType<typeof cardArtwork>[number]) => {
  const [failed, setFailed] = useState<string | undefined>();
  return { src: src === failed ? undefined : src, fit, onError: () => setFailed(src) };
};
