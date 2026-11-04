import { useLayoutEffect } from "preact/hooks";

import type { ContinueItem } from "../../contracts/launcher";
import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../types";

import { ContinueWatchingCard } from "./ContinueWatchingCard";
import { HomeSectionHeading } from "./HomeSectionHeading";

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
  useLayoutEffect(() => {
    const list = env.continueItems.current;
    if (list) {
      const offset = Math.max(0, Math.min(continueOffset, list.scrollWidth - list.clientWidth));
      if (offset !== continueOffset) {
        env.state.set({ ...env.state.getSnapshot(), continueOffset: offset });
      }
    }
  }, [env, items, continueOffset]);
  return (
    <section id="continue-section" hidden={!visible || !items.length}>
      <HomeSectionHeading title={t("home.continueWatching")} />
      <div class="continue-viewport" ref={env.continueViewport}>
        <div
          id="continue-items"
          class="row"
          aria-label={t("home.continueWatching")}
          ref={env.continueItems}
          data-offset={continueOffset}
          style={{ transform: "translate3d(" + -continueOffset + "px,0,0)" }}
        >
          {items.map((item) => (
            <ContinueWatchingCard key={item.key} env={env} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
};
