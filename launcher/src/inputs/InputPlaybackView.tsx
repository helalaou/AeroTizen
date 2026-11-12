import { useLayoutEffect, useRef } from "preact/hooks";

import type { InputsSnapshot } from "../contracts/inputs";
import { useStoreSelector } from "../shared/hooks/useStore";
import type { Store } from "../shared/state/createStore";

export interface InputPlaybackViewProps {
  applyBackground(): void;
  document: Document;
  inputs: Store<InputsSnapshot>;
  suspendBackground(): void;
}

// The TV window is an external video surface. Preact owns its shell visibility;
// source selection and device callbacks remain in the service and adapter.
export const InputPlaybackView = ({ inputs, document, applyBackground, suspendBackground }: InputPlaybackViewProps) => {
  const playback = useStoreSelector(inputs, (snapshot) => snapshot.playback);
  const previous = useRef(playback);
  const background = useRef<string | null>(null);
  useLayoutEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    body.classList.toggle("tv", playback === "playing");
    if (playback === "playing") {
      if (background.current === null) {
        background.current = html.style.background;
      }
      html.style.background = "transparent";
      suspendBackground();
    } else {
      if (background.current !== null) {
        html.style.background = background.current;
        background.current = null;
      }
      if (playback === "idle" && previous.current !== "idle") {
        applyBackground();
      }
    }
    previous.current = playback;
  }, [playback, document, applyBackground, suspendBackground]);
  useLayoutEffect(
    () => () => {
      const html = document.documentElement;
      document.body.classList.remove("tv");
      if (background.current !== null) {
        html.style.background = background.current;
      }
    },
    [document],
  );
  return null;
};
