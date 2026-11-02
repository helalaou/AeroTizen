import { useLayoutEffect } from "preact/hooks";

import type { ContinueItem } from "../../contracts/launcher";
import { useStore } from "../../shared/hooks/useStore";
import type { HomeEnvironment } from "../types";

import { ContinueWatchingCard } from "./ContinueWatchingCard";

export const ContinueWatchingRow = ({
  env,
  items,
  visible,
}: {
  env: HomeEnvironment;
  items: readonly ContinueItem[];
  visible: boolean;
}) => {
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
    <section id="continue-section" class="row-wrap" hidden={!visible || !items.length}>
      <h2>{env.translate("Continue Watching")}</h2>
      <div class="continue-viewport" ref={env.continueViewport}>
        <div
          id="continue-items"
          class="row"
          aria-label="Continue Watching"
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
