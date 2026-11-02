import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";

export const SettingsFocusIndicator = ({
  container,
  sidebar = false,
}: {
  container: RefObject<HTMLDivElement>;
  sidebar?: boolean;
}) => {
  const { navigation, drawer } = useSettingsEnvironment();
  const key = useStore(navigation);
  const state = useStore(drawer);
  const [style, setStyle] = useState({
    transform: "",
    width: "0px",
    height: "0px",
    borderRadius: "17px",
  });
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const host = container.current;
    const target = navigation.current();
    if (!host || !target || !host.contains(target)) {
      setVisible(false);
      return;
    }
    const rect = target.getBoundingClientRect();
    const parent = host.getBoundingClientRect();
    setStyle({
      transform:
        "translate3d(" +
        (rect.left - parent.left + host.scrollLeft) +
        "px," +
        (rect.top - parent.top + host.scrollTop) +
        "px,0)",
      width: rect.width + "px",
      height: rect.height + "px",
      borderRadius: getComputedStyle(target).borderRadius,
    });
    setVisible(Boolean(rect.width && rect.height));
  }, [container, key, navigation, state]);
  return (
    <div
      aria-hidden="true"
      class={
        "settings-focus-indicator " +
        (sidebar ? "settings-focus-indicator--sidebar" : "settings-focus-indicator--content") +
        (visible ? " is-visible" : "")
      }
      style={style}
    />
  );
};
