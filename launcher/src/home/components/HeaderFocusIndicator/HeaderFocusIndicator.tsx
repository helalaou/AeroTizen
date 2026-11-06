import { useLayoutEffect, useRef, useState } from "preact/hooks";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";

import styles from "./HeaderFocusIndicator.module.css";

const GROUP_KEYS: Record<"tabs" | "shortcuts", readonly string[]> = {
  tabs: ["home-tab", "apps-tab"],
  shortcuts: ["gear", "samsung-home-shortcut"],
};

export const HeaderFocusIndicator = ({
  env,
  group = "shortcuts",
}: {
  env: HomeEnvironment;
  group?: "shortcuts" | "tabs";
}) => {
  const { language } = useTranslation();
  const tabs = group === "tabs";
  const state = useStore(env.state);
  const keys = GROUP_KEYS[group];
  const focused = state.active && keys.includes(state.selected);
  const fallbackKey = tabs ? state.page + "-tab" : "";
  const key = focused ? state.selected : fallbackKey;
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
    const rect = node.getBoundingClientRect();
    const parent = host.getBoundingClientRect();
    setPlate({
      motion: positioned.current,
      style: {
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
      },
    });
    positioned.current = true;
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
