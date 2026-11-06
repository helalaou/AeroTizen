import type { ComponentChildren, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

import { useTranslation } from "../../../shared/i18n/useTranslation";
import { clampHorizontalOffset } from "../../state/horizontalScroll";

import styles from "./HorizontalScroller.module.css";

export const HorizontalScroller = ({
  children,
  id,
  label,
  offset,
  onOffsetChange,
  enabled = true,
  visible = true,
  trackClass = "",
  trackRef,
  viewportRef,
  trackData,
}: {
  children: ComponentChildren;
  id: string;
  label: string;
  offset: number;
  onOffsetChange(offset: number): void;
  enabled?: boolean;
  visible?: boolean;
  trackClass?: string;
  trackRef?: RefObject<HTMLDivElement>;
  viewportRef?: RefObject<HTMLDivElement>;
  trackData?: Readonly<Record<`data-${string}`, string | number>>;
}) => {
  const ownTrack = useRef<HTMLDivElement>(null);
  const track = trackRef || ownTrack;
  const { language } = useTranslation();
  const rtl = language === "ar";
  useLayoutEffect(() => {
    const node = track.current;
    if (!enabled || !visible || !node?.clientWidth) {
      return;
    }
    const next = clampHorizontalOffset(offset, node.clientWidth, node.scrollWidth);
    if (next !== offset) {
      onOffsetChange(next);
    }
  });
  return (
    <div
      class={styles.viewport}
      data-horizontal-scroller
      data-enabled={enabled ? "true" : undefined}
      hidden={!visible}
      ref={viewportRef}
    >
      <div
        id={id}
        class={styles.track + " " + trackClass}
        {...trackData}
        data-scroller-track
        data-enabled={enabled ? "true" : undefined}
        aria-label={label}
        ref={track}
        data-offset={enabled ? offset : undefined}
        style={enabled ? { transform: "translate3d(" + (rtl ? offset : -offset) + "px,0,0)" } : undefined}
      >
        {children}
      </div>
    </div>
  );
};
