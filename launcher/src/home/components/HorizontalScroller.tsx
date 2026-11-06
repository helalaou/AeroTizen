import type { ComponentChildren, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

import { useTranslation } from "../../shared/i18n/useTranslation";
import { clampHorizontalOffset } from "../state/horizontalScroll";

export const HorizontalScroller = ({
  children,
  id,
  label,
  offset,
  onOffsetChange,
  enabled = true,
  visible = true,
  viewportClass = "",
  trackClass = "",
  trackRef,
  viewportRef,
}: {
  children: ComponentChildren;
  id: string;
  label: string;
  offset: number;
  onOffsetChange(offset: number): void;
  enabled?: boolean;
  visible?: boolean;
  viewportClass?: string;
  trackClass?: string;
  trackRef?: RefObject<HTMLDivElement>;
  viewportRef?: RefObject<HTMLDivElement>;
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
      class={"horizontal-scroller" + (enabled ? " horizontal-scroller--enabled" : "") + " " + viewportClass}
      hidden={!visible}
      ref={viewportRef}
    >
      <div
        id={id}
        class={"horizontal-scroller__track " + trackClass}
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
