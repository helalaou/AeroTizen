import { useLayoutEffect, useRef, useState } from "preact/hooks";

import type { Theme } from "../../../contracts/preferences";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";

import styles from "./HeaderFocusIndicator.module.css";

const GROUP_KEYS: Record<"tabs" | "shortcuts", readonly string[]> = {
  tabs: ["home-tab", "apps-tab"],
  shortcuts: ["gear", "samsung-home-shortcut"],
};

interface PlateBox {
  height: string;
  transform: string;
  width: string;
}

const sameBox = (first: PlateBox, second: PlateBox) =>
  first.transform === second.transform && first.width === second.width && first.height === second.height;

export const HeaderFocusIndicator = ({
  env,
  group = "shortcuts",
  theme,
}: {
  env: HomeEnvironment;
  group?: "shortcuts" | "tabs";
  theme: Theme;
}) => {
  const { language } = useTranslation();
  const tabs = group === "tabs";
  const keys = GROUP_KEYS[group];
  const focused = useStoreSelector(env.state, (state) => state.active && keys.includes(state.selected));
  const key = useStoreSelector(env.state, (state) => {
    if (state.active && keys.includes(state.selected)) {
      return state.selected;
    }
    return tabs ? state.page + "-tab" : "";
  });
  const previousKey = useRef<string>();
  const [plate, setPlate] = useState({
    motion: false,
    style: { transform: "", width: "64px", height: "64px", left: "0px", top: "0px" },
  });
  useLayoutEffect(() => {
    const node = env.nodes.get(key);
    const host = node?.parentElement;
    const view = node?.ownerDocument.defaultView;
    if (!node || !host || !view) {
      return;
    }
    const update = (motion: boolean) => {
      const rect = node.getBoundingClientRect();
      const parent = host.getBoundingClientRect();
      const style = {
        transform:
          "translate3d(" +
          (rect.left - parent.left - host.clientLeft) +
          "px," +
          (rect.top - parent.top - host.clientTop) +
          "px,0)",
        width: rect.width + "px",
        height: rect.height + "px",
        left: "0px",
        top: "0px",
      };
      setPlate((previous) => (sameBox(previous.style, style) ? previous : { motion, style }));
    };
    update(previousKey.current !== undefined && previousKey.current !== key);
    previousKey.current = key;

    let frame: number | undefined;
    const followLayout = () => {
      if (frame === undefined) {
        frame = view.requestAnimationFrame(() => {
          frame = undefined;
          update(false);
        });
      }
    };
    const fonts = node.ownerDocument.fonts;
    fonts?.addEventListener("loadingdone", followLayout);
    view.addEventListener("resize", followLayout);
    return () => {
      if (frame !== undefined) {
        view.cancelAnimationFrame(frame);
      }
      fonts?.removeEventListener("loadingdone", followLayout);
      view.removeEventListener("resize", followLayout);
    };
  }, [env, key, language, theme]);
  return (
    <div
      aria-hidden="true"
      class={styles.indicator + " " + (tabs ? styles.tabs : styles.shortcuts)}
      data-header-focus={group}
      data-visible={tabs || focused ? "true" : undefined}
      data-focused={focused ? "true" : undefined}
      data-motion={plate.motion ? "true" : "false"}
      style={plate.style}
    />
  );
};
