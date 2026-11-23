import { useMemo } from "preact/hooks";

import type { ContinueItem } from "../../../contracts/launcher";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import type { HomeEnvironment } from "../../types";
import { AppArtwork } from "../AppArtwork/AppArtwork";

import styles from "./ContinueWatchingSourceBadge.module.css";

export const ContinueWatchingSourceBadge = ({
  env,
  item: { sourceId, sourceName, sourceIcon },
  placement = "corner",
}: {
  env: HomeEnvironment;
  item: ContinueItem;
  placement?: "corner" | "inline";
}) => {
  const installed = useStoreSelector(env.inventory, ({ apps }) => apps.find((app) => app.id === sourceId));
  const presentation = useMemo(
    () => env.describe(installed ?? { id: sourceId, name: sourceName, icon: sourceIcon }),
    [env, installed, sourceId, sourceName, sourceIcon],
  );
  return (
    <div class={styles.badge} data-continue-part="source-badge" data-placement={placement} aria-hidden="true">
      <AppArtwork presentation={presentation} active variant="badge" />
    </div>
  );
};
