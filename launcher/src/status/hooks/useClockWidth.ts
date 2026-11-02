import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

import type { ClockService } from "../../contracts/launcher";
import type { TimeFormat } from "../../contracts/preferences";

export const useClockWidth = (
  ref: RefObject<HTMLSpanElement>,
  clock: ClockService,
  format: TimeFormat,
  timestamp: number,
  appearance: string,
) => {
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const style = getComputedStyle(node);
    const context =
      contextRef.current || (contextRef.current = node.ownerDocument.createElement("canvas").getContext("2d"));
    if (!context) {
      return;
    }
    const font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    context.font = font;
    setWidth(clock.measureTime(format, font, (value) => context.measureText(value).width));
  }, [ref, clock, format, timestamp, appearance]);
  return width;
};
