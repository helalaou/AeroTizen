import { useLayoutEffect, useRef, useState } from "preact/hooks";

import styles from "./StageBackground.module.css";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./stageGeometry";
import { createHalftoneTile, HALFTONE_TILE } from "./stageHalftone";
import type { StageAnimation } from "./stageRenderer";
import { startStage } from "./stageRenderer";

const MAX_TILE_SCALE = 2;

interface Props {
  reportWebGL(available: boolean): void;
  speed: number;
}

export const StageBackground = ({ speed, reportWebGL }: Props) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tile, setTile] = useState<string | null>(null);
  const animation = useRef<StageAnimation | undefined>(undefined);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }
    const document = element.ownerDocument;
    setTile(createHalftoneTile(document, Math.min(document.defaultView?.devicePixelRatio || 1, MAX_TILE_SCALE)));
  }, []);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }
    const controller = startStage(element);
    if (!controller) {
      reportWebGL(false);
      return;
    }
    animation.current = controller;
    const onLoss = () => reportWebGL(false);
    element.addEventListener("webglcontextlost", onLoss);
    reportWebGL(true);
    return () => {
      element.removeEventListener("webglcontextlost", onLoss);
      animation.current = undefined;
      controller.stop();
    };
  }, [reportWebGL]);
  useLayoutEffect(() => {
    animation.current?.setSpeed(speed);
  }, [speed, reportWebGL]);
  return (
    <div class={styles.stage} data-stage-background>
      <canvas class={styles.canvas} data-renderer="webgl" ref={canvas} width={STAGE_WIDTH} height={STAGE_HEIGHT} />
      <div
        class={styles.halftone}
        data-stage-halftone
        style={{
          backgroundImage: tile ? "url(" + tile + ")" : undefined,
          backgroundSize: HALFTONE_TILE + "px " + HALFTONE_TILE + "px",
        }}
      />
    </div>
  );
};
