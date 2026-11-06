import { useLayoutEffect, useRef } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import type { Translate } from "../../shared/i18n/createTranslations";
import type { Store } from "../../shared/state/createStore";
import { FIRE_HEIGHT, FIRE_WIDTH, startFireAnimation } from "../startFireAnimation";

import styles from "./FireplaceView.module.css";

export interface FireplaceState {
  readonly open: boolean;
  readonly volume: number;
  readonly volumeVisible: boolean;
}

export const FireplaceView = ({ state, translate }: { state: Store<FireplaceState>; translate: Translate }) => {
  const { open, volume, volumeVisible } = useStore(state);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (open && canvas.current) {
      return startFireAnimation(canvas.current);
    }
  }, [open]);
  if (!open) {
    return null;
  }
  return (
    <div id="fireplace" class={styles.fireplace}>
      <canvas id="fire-canvas" class={styles.canvas} ref={canvas} width={FIRE_WIDTH} height={FIRE_HEIGHT} />
      <div class={styles.hearth} />
      <div id="fire-volume" class={styles.volume} data-visible={volumeVisible}>
        {volume === 0 ? translate("fireplace.muted") : translate("fireplace.volume", { level: volume })}
      </div>
    </div>
  );
};
