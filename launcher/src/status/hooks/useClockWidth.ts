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
  visible = true,
) => {
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !visible) {
      return;
    }
    const style = getComputedStyle(node);
    const context =
      contextRef.current || (contextRef.current = node.ownerDocument.createElement("canvas").getContext("2d"));
    if (!context) {
      return;
    }
    const font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    const fonts = node.ownerDocument.fonts;
    let cancelScan: (() => void) | undefined;
    let waitingForFonts = false;
    let disposed = false;
    const measure = () => {
      context.font = font;
      const measureText = (value: string) => context.measureText(value).width;
      if (clock.measureTimeDeferred) {
        cancelScan = clock.measureTimeDeferred(format, font, measureText, setWidth);
      } else {
        setWidth(clock.measureTime(format, font, measureText));
      }
    };
    const waitForFonts = () => {
      if (!fonts || waitingForFonts) {
        return;
      }
      waitingForFonts = true;
      cancelScan?.();
      cancelScan = undefined;
      // The CSS font string stays the same when a web font replaces its fallback.
      clock.clearTimeWidthCache?.();
      setWidth(undefined);
      void fonts.ready.then(() => {
        if (!disposed) {
          waitingForFonts = false;
          measure();
        }
      });
    };
    fonts?.addEventListener("loading", waitForFonts);
    if (fonts?.status === "loading") {
      waitForFonts();
    } else {
      measure();
    }
    return () => {
      disposed = true;
      cancelScan?.();
      fonts?.removeEventListener("loading", waitForFonts);
    };
  }, [ref, clock, format, timestamp, appearance, visible]);
  return width;
};
