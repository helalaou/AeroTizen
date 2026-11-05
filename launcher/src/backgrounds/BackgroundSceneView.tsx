import type { BackgroundGraphics, BackgroundScene } from "../contracts/backgrounds";
import { needsWebGL } from "../contracts/backgrounds";
import { useStore } from "../shared/hooks/useStore";

import { blob } from "./scenes";
import { WaveBackground } from "./WaveBackground";
import { WebGLParticleCanvas } from "./WebGLParticleCanvas";

const BLOB_SPOTS = [
  { left: "-10%", top: "-20%", size: 1100, seconds: 11 },
  { left: "55%", top: "35%", size: 1200, seconds: 14 },
  { left: "20%", top: "55%", size: 1000, seconds: 16 },
  { left: "70%", top: "-15%", size: 900, seconds: 12 },
];
const SLOW_SECONDS = 22;

interface Props {
  reportWebGL(available: boolean): void;
  scene: BackgroundScene;
  speed: number;
  webGL: BackgroundGraphics;
}

export const BackgroundSceneView = ({ scene, speed, webGL, reportWebGL }: Props) => {
  const available = useStore(webGL);
  if (available === false && needsWebGL(scene)) {
    return null;
  }
  switch (scene.anim) {
    case "blobs":
      return (
        <>
          {scene.blobs.map((color, index) => {
            const spot = BLOB_SPOTS[index % BLOB_SPOTS.length];
            return (
              <div
                key={index}
                class={"bg-blob bg-drift" + (index % BLOB_SPOTS.length)}
                style={{
                  animationDuration: (scene.slow ? SLOW_SECONDS : spot.seconds) / speed + "s",
                  left: spot.left,
                  top: spot.top,
                  width: spot.size,
                  height: spot.size,
                  background: blob(color),
                }}
              />
            );
          })}
          {scene.stars && <WebGLParticleCanvas kind="nebula" speed={speed} reportWebGL={reportWebGL} />}
        </>
      );
    case "waves":
      return <WaveBackground speed={speed} />;
    case "stars":
      return <WebGLParticleCanvas kind="stars" speed={speed} reportWebGL={reportWebGL} />;
    case "particles":
      return <WebGLParticleCanvas kind={scene.kind} speed={speed} reportWebGL={reportWebGL} />;
    default:
      return null;
  }
};
