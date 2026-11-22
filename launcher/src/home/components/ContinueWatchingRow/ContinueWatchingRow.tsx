import type { ContinueItem } from "../../../contracts/launcher";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";
import { ContinueWatchingCard } from "../ContinueWatchingCard/ContinueWatchingCard";
import { HomeSectionHeading } from "../HomeSectionHeading/HomeSectionHeading";
import { HorizontalScroller } from "../HorizontalScroller/HorizontalScroller";

import styles from "./ContinueWatchingRow.module.css";

export const ContinueWatchingRow = ({
  env,
  items,
  coverArt,
  showDetails,
  showHeading,
  visible,
}: {
  coverArt: boolean;
  env: HomeEnvironment;
  items: readonly ContinueItem[];
  showDetails: boolean;
  showHeading: boolean;
  visible: boolean;
}) => {
  const { t } = useTranslation();
  const title = t("home.continueWatching");
  const continueOffset = useStoreSelector(env.state, (state) => state.continueOffset);
  return (
    <section id="continue-section" aria-label={title} hidden={!visible || !items.length}>
      {showHeading && <HomeSectionHeading title={title} />}
      <HorizontalScroller
        id="continue-items"
        label={title}
        trackClass={styles.track}
        trackData={{ "data-cover-art": coverArt ? "true" : "false" }}
        trackRef={env.continueItems}
        viewportRef={env.continueViewport}
        offset={continueOffset}
        visible={visible && items.length > 0}
        onOffsetChange={(offset) => env.state.set({ ...env.state.getSnapshot(), continueOffset: offset })}
      >
        {items.map((item) => (
          <ContinueWatchingCard
            key={item.key}
            env={env}
            item={item}
            showDetails={showDetails}
            coverArt={coverArt}
            visible={visible}
          />
        ))}
      </HorizontalScroller>
    </section>
  );
};
