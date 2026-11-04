import { render } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

import { useStore } from "../shared/hooks/useStore";
import type { Translate } from "../shared/i18n/createTranslations";
import type { Store } from "../shared/state/createStore";
import { createStore } from "../shared/state/createStore";

import { FIRE_HEIGHT, FIRE_WIDTH, startFireAnimation } from "./startFireAnimation";
import { startFireAudio } from "./startFireAudio";

const MAX_VOLUME = 10;
const VOLUME_NOTICE_MS = 1500;

interface FireplaceState {
  readonly open: boolean;
  readonly volume: number;
  readonly volumeVisible: boolean;
}

const FireplaceView = ({ state, translate }: { state: Store<FireplaceState>; translate: Translate }) => {
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
    <div id="fireplace" class="fireplace">
      <canvas id="fire-canvas" ref={canvas} width={FIRE_WIDTH} height={FIRE_HEIGHT} />
      <div class="hearth" />
      <div id="fire-volume" class={volumeVisible ? "fire-volume show" : "fire-volume"}>
        {volume === 0 ? translate("fireplace.muted") : translate("fireplace.volume", { level: volume })}
      </div>
    </div>
  );
};

export const mountFireplace = (host: HTMLElement, translate: Translate) => {
  const state = createStore<FireplaceState>({ open: false, volume: 6, volumeVisible: false });
  let audio: ReturnType<typeof startFireAudio>;
  let volumeTimer: number | undefined;
  let disposed = false;

  const close = () => {
    const current = state.getSnapshot();
    if (!current.open) {
      return;
    }
    window.clearTimeout(volumeTimer);
    volumeTimer = undefined;
    audio?.stop();
    audio = undefined;
    state.set({ ...current, open: false, volumeVisible: false });
  };
  const changeVolume = (step: number) => {
    const current = state.getSnapshot();
    if (!current.open) {
      return;
    }
    const volume = Math.max(0, Math.min(MAX_VOLUME, current.volume + step));
    audio?.setVolume(volume / MAX_VOLUME);
    state.set({ ...current, volume, volumeVisible: true });
    window.clearTimeout(volumeTimer);
    volumeTimer = window.setTimeout(() => {
      volumeTimer = undefined;
      state.set({ ...state.getSnapshot(), volumeVisible: false });
    }, VOLUME_NOTICE_MS);
  };
  render(<FireplaceView state={state} translate={translate} />, host);
  return {
    bridge: {
      open() {
        const current = state.getSnapshot();
        if (disposed || current.open) {
          return;
        }
        // Start audio on the launch gesture, before Preact renders the canvas.
        audio = startFireAudio(window, current.volume / MAX_VOLUME);
        state.set({ ...current, open: true });
      },
      close,
      isOpen: () => state.getSnapshot().open,
      volumeUp: () => changeVolume(1),
      volumeDown: () => changeVolume(-1),
    },
    dispose() {
      disposed = true;
      close();
      render(null, host);
    },
  };
};
