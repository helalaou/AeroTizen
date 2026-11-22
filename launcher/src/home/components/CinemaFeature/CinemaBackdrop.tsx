import { useLayoutEffect, useState } from "preact/hooks";

import styles from "./CinemaFeature.module.css";

interface Layer {
  readonly ready: boolean;
  readonly src: string;
}

interface Props {
  onError(url: string): void;
  onVisibilityChange(visible: boolean): void;
  src?: string;
}

export const CinemaBackdrop = ({ src, onError, onVisibilityChange }: Props) => {
  const [layers, setLayers] = useState<readonly Layer[]>([]);
  useLayoutEffect(() => {
    setLayers((layers) => {
      // Retain only the latest loaded image while the next one comes in.
      const outgoing = layers.filter((layer) => layer.ready && layer.src !== src).slice(-1);
      if (!src) {
        return outgoing;
      }
      const incoming = layers.find((layer) => layer.src === src) ?? { src, ready: false };
      return [...outgoing, incoming];
    });
  }, [src]);
  // Keep the last image visible until its replacement loads, even during fast navigation.
  const current =
    src && (layers.find((layer) => layer.ready && layer.src === src) ?? layers.find((layer) => layer.ready));
  const visible = Boolean(current);
  useLayoutEffect(() => {
    if (visible) {
      onVisibilityChange(true);
      return () => onVisibilityChange(false);
    }
  }, [visible, onVisibilityChange]);
  return (
    <>
      <div class={styles.blackBacking} data-cinema-backing data-visible={visible ? "true" : "false"} />
      <div class={styles.backdrop}>
        {layers.map((layer) => (
          <img
            key={layer.src}
            class={styles.art}
            data-cinema-backdrop
            data-visible={layer === current ? "true" : "false"}
            src={layer.src}
            decoding="async"
            alt=""
            onLoad={(event) => {
              // Commit the starting opacity before even cached artwork fades in.
              event.currentTarget.getBoundingClientRect();
              setLayers((layers) => layers.map((item) => (item.src === layer.src ? { ...item, ready: true } : item)));
            }}
            onError={() => {
              setLayers((layers) => layers.filter((item) => item.src !== layer.src));
              if (layer.src === src) {
                onError(layer.src);
              }
            }}
            onTransitionEnd={(event) => {
              if (event.propertyName === "opacity" && layer !== current && layer.src !== src) {
                setLayers((layers) => layers.filter((item) => item.src !== layer.src));
              }
            }}
          />
        ))}
      </div>
    </>
  );
};
