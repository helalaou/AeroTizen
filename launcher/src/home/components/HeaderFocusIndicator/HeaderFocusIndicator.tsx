import { useLayoutEffect, useRef, useState } from "preact/hooks";

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
}: {
  env: HomeEnvironment;
  group?: "shortcuts" | "tabs";
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
  const positioned = useRef(false);
  const [plate, setPlate] = useState({
    motion: false,
    style: { transform: "", width: "64px", height: "64px", left: "0px", top: "0px" },
  });
  useLayoutEffect(() => {
    const node = env.nodes.get(key);
    const host = node?.parentElement;
    if (!node || !host) {
      return;
    }
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const parent = host.getBoundingClientRect();
      return {
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
    };
    const followResize = () => {
      const style = measure();
      setPlate((previous) => (sameBox(previous.style, style) ? previous : { motion: false, style }));
    };
    setPlate({ motion: positioned.current, style: measure() });
    positioned.current = true;
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(followResize) : undefined;
    resize?.observe(node);
    resize?.observe(host);
    return () => resize?.disconnect();
  }, [env, key, language]);
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
