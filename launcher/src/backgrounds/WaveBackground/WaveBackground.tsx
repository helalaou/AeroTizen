import styles from "./WaveBackground.module.css";

const WAVE_LAYERS = [
  {
    name: "back",
    seconds: 28,
    fill: "rgba(30,130,190,.28)",
    path: "M0 60 Q 240 20 480 60 T 960 60 T 1440 60 T 1920 60 V 200 H 0 Z",
  },
  {
    name: "front",
    seconds: 18,
    fill: "rgba(20,90,150,.38)",
    path: "M0 80 Q 240 40 480 80 T 960 80 T 1440 80 T 1920 80 V 200 H 0 Z",
  },
] as const;

export const WaveBackground = ({ speed }: { speed: number }) => (
  <>
    {WAVE_LAYERS.map((layer) => (
      <div
        key={layer.name}
        class={styles.wave}
        data-background-wave={layer.name}
        style={{ animationDuration: layer.seconds / speed + "s" }}
      >
        <svg viewBox="0 0 1920 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path fill={layer.fill} d={layer.path} />
          <path fill={layer.fill} transform="translate(1920 0)" d={layer.path} />
        </svg>
      </div>
    ))}
  </>
);
