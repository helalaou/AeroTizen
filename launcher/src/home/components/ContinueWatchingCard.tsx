import { useMemo, useState } from "preact/hooks";

import type { ContinueItem } from "../../contracts/launcher";
import { useTranslation } from "../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../types";

import { AppArtwork } from "./AppArtwork";
import { HomeControl } from "./HomeControl";

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
      className={"continue-card" + (episode ? " episodic" : "")}
      title={
        episode
          ? t("continue.episodeTitle", { title: item.title, episode, source: item.sourceName })
          : t("continue.itemTitle", { title: item.title, source: item.sourceName })
      }
    >
      <div class="continue-image-wrap">
        {artwork && (
          <img
            key={artwork.src}
            class={artwork === poster ? "continue-image" : "continue-image continue-image--landscape"}
            alt=""
            src={artwork.src}
            onError={artwork.onError}
          />
        )}
        <div class="tile app-tile continue-app-icon" aria-hidden="true" style={{ background: brand.background }}>
          <AppArtwork app={app} brand={brand} active variant="badge" />
        </div>
      </div>
      <div class={"continue-progress" + (progress > 0 ? "" : " empty")} aria-hidden="true">
        {progress > 0 && <div class="continue-progress-fill" style={{ width: progress + "%" }} />}
      </div>
      <div class="continue-label">
        <div class="continue-details">
          <div class="continue-title">{item.title}</div>
          {episode ? <div class="continue-episode">{episode}</div> : null}
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
