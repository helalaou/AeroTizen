import type { ContinueItem } from "../../../contracts/launcher";
import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";
import { ContinueWatchingCard } from "../ContinueWatchingCard/ContinueWatchingCard";
import { HomeSectionHeading } from "../HomeSectionHeading/HomeSectionHeading";
import { HorizontalScroller } from "../HorizontalScroller/HorizontalScroller";

import styles from "./ContinueWatchingRow.module.css";

export const ContinueWatchingRow = ({
  env,
  items,
  visible,
}: {
  env: HomeEnvironment;
  items: readonly ContinueItem[];
  visible: boolean;
}) => {
  const { t } = useTranslation();
  const { continueOffset } = useStore(env.state);
  return (
    <section id="continue-section" hidden={!visible || !items.length}>
      <HomeSectionHeading title={t("home.continueWatching")} />
      <HorizontalScroller
        id="continue-items"
        label={t("home.continueWatching")}
        trackClass={styles.track}
        trackRef={env.continueItems}
        viewportRef={env.continueViewport}
        offset={continueOffset}
        visible={visible && items.length > 0}
        onOffsetChange={(offset) => env.state.set({ ...env.state.getSnapshot(), continueOffset: offset })}
      >
        {items.map((item) => (
          <ContinueWatchingCard key={item.key} env={env} item={item} />
        ))}
      </HorizontalScroller>
    </section>
  );
};
