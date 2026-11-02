import { useLayoutEffect, useRef, useState } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import type { HomeEnvironment } from "../types";

export const HeaderFocusIndicator = ({
  env,
  group = "shortcuts",
}: {
  env: HomeEnvironment;
  group?: "shortcuts" | "tabs";
}) => {
  const tabs = group === "tabs";
  const state = useStore(env.state);
  const keys = tabs ? ["home-tab", "apps-tab"] : ["gear", "samsung-home-shortcut"];
  const focused = state.active && keys.includes(state.selected);
  const key = focused ? state.selected : tabs ? state.page + "-tab" : "";
  const positioned = useRef(false);
  const [plate, setPlate] = useState({
    motion: false,
    style: { transform: "", width: "64px", height: "64px", left: "0px", top: "0px" },
  });
  useLayoutEffect(() => {
    const measure = () => {
      const node = env.nodes.get(key),
        host = node?.parentElement;
      if (!node || !host) {
        return;
      }
      const rect = node.getBoundingClientRect(),
        parent = host.getBoundingClientRect();
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
    };
    measure();
  }, [env, key]);
  return (
    <div
      aria-hidden="true"
      class={
        "header-focus-indicator " +
        (tabs ? "header-focus-indicator--tabs" : "header-focus-indicator--shortcuts") +
        (tabs || focused ? " is-visible" : "") +
        (focused ? " is-focused" : "") +
        (plate.motion ? "" : " no-motion")
      }
      style={plate.style}
    />
  );
};
