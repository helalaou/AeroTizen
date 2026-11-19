import type { ComponentChildren } from "preact";
import { useLayoutEffect } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import type { Store } from "../../shared/state/createStore";
import { isLightColour } from "../colours";
import type { BackgroundState } from "../createBackgrounds";
import { gradientMidpoint } from "../gradients";

import styles from "./BackgroundLayer.module.css";

interface Props {
  children?: ComponentChildren;
  cinemaBackdrop: Store<boolean>;
  document: Document;
  state: BackgroundState;
}

export const BackgroundLayer = ({ children, cinemaBackdrop, document, state }: Props) => {
  const { current, suspended } = state;
  const darkBackdropVisible = useStore(cinemaBackdrop);
  useLayoutEffect(() => {
    // The document is outside the Preact roots. Its background must stay transparent
    // during native TV playback, and a body background would cover the animated layer.
    const html = document.documentElement;
    const body = document.body;
    if (current && !suspended) {
      html.style.background = current.base;
      body.style.background = "transparent";
    }
  }, [document, current, suspended]);
  useLayoutEffect(() => {
    const light = Boolean(
      !suspended &&
      !darkBackdropVisible &&
      current &&
      (current.lightBackground ||
        (current.category === "solid" && isLightColour(current.base)) ||
        (current.gradient && isLightColour(gradientMidpoint(current.gradient)))),
    );
    document.documentElement.setAttribute("data-light-background", String(light));
  }, [document, current, suspended, darkBackdropVisible]);
  return (
    <div id="bg" class={styles.layer} data-background-host data-cinema-covered={darkBackdropVisible} hidden={suspended}>
      {!suspended && children}
    </div>
  );
};
