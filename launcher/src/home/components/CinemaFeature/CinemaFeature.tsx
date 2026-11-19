import { useLayoutEffect, useState } from "preact/hooks";

import type { ContinueArtwork } from "../../../contracts/continueWatching";
import type { ContinueItem } from "../../../contracts/launcher";
import { cardArtwork } from "../../../shared/continueWatchingArtwork";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";
import { ContinueWatchingSourceBadge } from "../ContinueWatchingSourceBadge/ContinueWatchingSourceBadge";

import { CinemaBackdrop } from "./CinemaBackdrop";
import styles from "./CinemaFeature.module.css";

interface Props {
  env: HomeEnvironment;
  items: readonly ContinueItem[];
  onBackdropVisibilityChange(visible: boolean): void;
}

export const CinemaFeature = ({ env, items, onBackdropVisibilityChange }: Props) => {
  const { t } = useTranslation();
  const selected = useStoreSelector(env.state, (state) => (state.active ? state.selected : ""));
  const item = items.find((item) => "continue:" + item.key === selected);
  const service = env.runtime.continueWatching;
  const [resolved, setResolved] = useState<{ item: ContinueItem; result: ContinueArtwork }>();
  const [failed, setFailed] = useState<{ item: ContinueItem; urls: readonly string[] }>();
  useLayoutEffect(() => {
    if (item) {
      return service.watchBackdrop?.(item, (result) => setResolved({ item, result }));
    }
  }, [item, service]);
  const lookup = resolved?.item === item ? resolved?.result : undefined;
  const awaitingArtwork = !!service.watchBackdrop && lookup?.status !== "ready";
  const backdrop =
    item &&
    !awaitingArtwork &&
    [
      lookup?.status === "ready" ? lookup.url : undefined,
      item.backdropImage,
      ...cardArtwork(item).map(({ src }) => src),
    ].find((url) => url && (failed?.item !== item || !failed.urls.includes(url)));
  return (
    <div class={styles.feature} aria-hidden="true">
      <CinemaBackdrop
        src={backdrop || undefined}
        pending={Boolean(item && awaitingArtwork)}
        onVisibilityChange={onBackdropVisibilityChange}
        onError={(url) => {
          if (item) {
            setFailed((previous) => ({ item, urls: [...(previous?.item === item ? previous.urls : []), url] }));
          }
        }}
      />
      {item && (
        <div class={styles.details} data-cinema-feature>
          <h1 class={styles.title}>{item.title}</h1>
          <div class={styles.source}>
            <ContinueWatchingSourceBadge env={env} item={item} placement="inline" />
            {item.season > 0 && item.episode > 0 && (
              <span class={styles.episode}>
                {t("continue.episode", { season: item.season, episode: item.episode })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
