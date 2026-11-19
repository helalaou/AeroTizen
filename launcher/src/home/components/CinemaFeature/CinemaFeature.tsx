import { useLayoutEffect, useState } from "preact/hooks";

import type { ContinueArtwork } from "../../../contracts/continueWatching";
import type { ContinueItem } from "../../../contracts/launcher";
import { cardArtwork } from "../../../shared/continueWatchingArtwork";

import { CinemaBackdrop } from "./CinemaBackdrop";
import styles from "./CinemaFeature.module.css";
import type { ProgrammeProps } from "./useSelectedProgramme";
import { useSelectedProgramme } from "./useSelectedProgramme";

interface Props extends ProgrammeProps {
  onBackdropVisibilityChange(visible: boolean): void;
}

export const CinemaFeature = ({ env, items, onBackdropVisibilityChange }: Props) => {
  const item = useSelectedProgramme({ env, items });
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
    </div>
  );
};
