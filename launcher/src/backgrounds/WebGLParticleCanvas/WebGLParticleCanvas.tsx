import { useLayoutEffect, useRef } from "preact/hooks";

import { H, W } from "../particleAnimation";
import type { WebGLParticleKind } from "../webglParticles";
import { startWebGLParticles } from "../webglParticles";

import styles from "./WebGLParticleCanvas.module.css";

interface Props {
  kind: WebGLParticleKind;
  reportWebGL(available: boolean): void;
  speed: number;
}

export const WebGLParticleCanvas = ({ kind, speed, reportWebGL }: Props) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }
    const stop = startWebGLParticles(element, kind, speed);
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
  }, [kind, speed, reportWebGL]);
  return <canvas class={styles.canvas} data-renderer="webgl" ref={canvas} width={W} height={H} />;
};
