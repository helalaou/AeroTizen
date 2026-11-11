import { useLayoutEffect, useRef } from "preact/hooks";

import styles from "./StageBackground.module.css";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./stageGeometry";
import { createHalftoneTile, HALFTONE_TILE } from "./stageHalftone";
import { startStage } from "./stageRenderer";

const MAX_TILE_SCALE = 2;

interface Props {
  reportWebGL(available: boolean): void;
  speed: number;
}

export const StageBackground = ({ speed, reportWebGL }: Props) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const halftone = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = halftone.current;
    if (!element) {
      return;
    }
    const tile = createHalftoneTile(element.ownerDocument, Math.min(window.devicePixelRatio || 1, MAX_TILE_SCALE));
    element.style.backgroundImage = tile ? "url(" + tile + ")" : "";
    element.style.backgroundSize = HALFTONE_TILE + "px " + HALFTONE_TILE + "px";
  }, []);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }
    const stop = startStage(element, speed);
    if (!stop) {
      reportWebGL(false);
      return;
    }
    const onLoss = () => reportWebGL(false);
    element.addEventListener("webglcontextlost", onLoss);
    reportWebGL(true);
    return () => {
      element.removeEventListener("webglcontextlost", onLoss);
      stop();
    };
  }, [speed, reportWebGL]);
  return (
    <div class={styles.stage} data-stage-background>
      <canvas class={styles.canvas} data-renderer="webgl" ref={canvas} width={STAGE_WIDTH} height={STAGE_HEIGHT} />
      <div class={styles.halftone} ref={halftone} />
    </div>
  );
};
