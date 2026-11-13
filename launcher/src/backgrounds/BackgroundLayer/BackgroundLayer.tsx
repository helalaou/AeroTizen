import type { ComponentChildren } from "preact";
import { useLayoutEffect } from "preact/hooks";

import { isLightColour } from "../colours";
import type { BackgroundState } from "../createBackgrounds";
import { gradientMidpoint } from "../gradients";

import styles from "./BackgroundLayer.module.css";

interface Props {
  children?: ComponentChildren;
  document: Document;
  state: BackgroundState;
}

export const BackgroundLayer = ({ children, document, state }: Props) => {
  const { current, suspended } = state;
  useLayoutEffect(() => {
    // The document is outside the Preact roots. Its background must stay transparent
    // during native TV playback, and a body background would cover the animated layer.
    const html = document.documentElement;
    const body = document.body;
    if (current && !suspended) {
      html.style.background = current.base;
      body.style.background = "transparent";
    }
    const light = Boolean(
      !suspended &&
      current &&
      (current.lightBackground ||
        (current.category === "solid" && isLightColour(current.base)) ||
        (current.gradient && isLightColour(gradientMidpoint(current.gradient)))),
    );
    html.setAttribute("data-light-background", String(light));
  }, [document, current, suspended]);
  return (
    <div id="bg" class={styles.layer} data-background-host hidden={suspended}>
      {!suspended && children}
    </div>
  );
};
