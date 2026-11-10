import type { AppPresentation } from "../../../contracts/launcher";
import type { useImageSequence } from "../../hooks/useImageSequence";
import type { AppFallbackVariant } from "../AppFallback/AppFallback";
import { AppFallback } from "../AppFallback/AppFallback";

import styles from "./AppArtworkContent.module.css";

export const AppArtworkContent = ({
  presentation,
  artwork,
  variant = "home",
}: {
  presentation: AppPresentation;
  artwork: ReturnType<typeof useImageSequence>;
  variant?: AppFallbackVariant;
}) => {
  const compact = artwork.loaded && !!presentation.appIcon && artwork.src === presentation.appIcon;
  return (
    <div
      class={styles.content + " " + styles[variant] + (compact ? " " + styles.compact : "")}
      data-app-artwork-kind={compact ? "icon" : "artwork"}
    >
      {artwork.src ? (
        <img
          key={artwork.src}
          ref={artwork.ref}
          class={styles.image + (compact ? " " + styles.icon : "")}
          data-app-artwork
          alt=""
          src={artwork.src}
          hidden={!artwork.loaded}
          style={{ display: artwork.loaded ? undefined : "none" }}
          onLoad={artwork.onLoad}
          onError={artwork.onError}
        />
      ) : null}
      <AppFallback title={presentation.title} hidden={artwork.loaded && !compact} variant={variant} compact={compact} />
    </div>
  );
};
