import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";

import styles from "./SettingsFocusIndicator.module.css";

interface FocusPlate {
  key: string | undefined;
  motion: boolean;
  scope: string;
  style: {
    borderRadius: string;
    height: string;
    transform: string;
    width: string;
  };
  visible: boolean;
}

export const SettingsFocusIndicator = ({
  container,
  sidebar = false,
}: {
  container: RefObject<HTMLDivElement>;
  sidebar?: boolean;
}) => {
  const { language } = useTranslation();
  const { navigation, drawer } = useSettingsEnvironment();
  const key = useStore(navigation);
  const state = useStore(drawer);
  const [plate, setPlate] = useState<FocusPlate>({
    key: undefined,
    scope: "",
    motion: false,
    visible: false,
    style: { transform: "", width: "0px", height: "0px", borderRadius: "17px" },
  });
  useLayoutEffect(() => {
    const host = container.current;
    if (!host) {
      return;
    }
    let frame: number | undefined;
    let animate = true;
    let observed: HTMLElement | undefined;
    const scope = state.category + ":" + state.expanded;
    const measure = (allowMotion: boolean) => {
      const target = navigation.current();
      if (!key || !target || target.dataset.key !== key || !host.contains(target)) {
        setPlate((previous) => (previous.visible ? { ...previous, visible: false, motion: false } : previous));
        return;
      }
      // Watch only the selected control's size chain and structural changes in its host.
      // Position can change without a new focus key, as when an inline editor closes.
      if (target !== observed) {
        observed = target;
        resize?.disconnect();
        for (let node: HTMLElement | null = target; node && host.contains(node); node = node.parentElement) {
          resize?.observe(node);
        }
        mutations.observe(host, {
          childList: true,
          characterData: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["hidden"],
        });
      }
      const rect = target.getBoundingClientRect();
      const parent = host.getBoundingClientRect();
      const style = {
        transform:
          "translate3d(" +
          (rect.left - parent.left + host.scrollLeft - host.clientLeft) +
          "px," +
          (rect.top - parent.top + host.scrollTop - host.clientTop) +
          "px,0)",
        width: rect.width + "px",
        height: rect.height + "px",
        borderRadius: getComputedStyle(target).borderRadius,
      };
      const visible = Boolean(rect.width && rect.height && target.dataset.settingsFocusOwner !== "control");
      setPlate((previous) => {
        if (
          previous.key === key &&
          previous.scope === scope &&
          previous.visible === visible &&
          previous.style.transform === style.transform &&
          previous.style.width === style.width &&
          previous.style.height === style.height &&
          previous.style.borderRadius === style.borderRadius
        ) {
          return previous;
        }
        const motion =
          sidebar ||
          (allowMotion &&
            previous.visible &&
            previous.key !== key &&
            previous.scope === scope &&
            previous.style.width === style.width &&
            previous.style.height === style.height);
        return { key, scope, style, visible, motion };
      });
    };
    const schedule = (allowMotion: boolean) => {
      animate = animate && allowMotion;
      if (frame !== undefined) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const motion = animate;
        animate = true;
        measure(motion);
      });
    };
    const reflow = () => schedule(false);
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(reflow) : undefined;
    // Ignore the indicator's own styles and focus attributes to avoid a measurement loop.
    const mutations = new MutationObserver(reflow);
    if (!resize) {
      window.addEventListener("resize", reflow);
    }
    // Focus stores can update before their sibling components have committed the new layout.
    schedule(true);
    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      resize?.disconnect();
      mutations.disconnect();
      if (!resize) {
        window.removeEventListener("resize", reflow);
      }
    };
  }, [container, key, navigation, state, language, sidebar]);
  return (
    <div
      aria-hidden="true"
      class={styles.indicator + " " + (sidebar ? styles.sidebar : styles.content)}
      data-settings-focus={sidebar ? "sidebar" : "content"}
      data-visible={plate.visible ? "true" : undefined}
      data-motion={sidebar || plate.motion ? "true" : "false"}
      style={plate.style}
    />
  );
};
