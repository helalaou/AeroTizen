import type { AppPresentation } from "../../../contracts/launcher";
import type { AppFallbackVariant } from "../../../shared/components/AppFallback/AppFallback";
import { AppFallback } from "../../../shared/components/AppFallback/AppFallback";
import { useImageSequence } from "../../../shared/hooks/useImageSequence";

import styles from "./AppArtwork.module.css";

export const AppArtwork = ({
  presentation,
  active,
  variant = "home",
}: {
  presentation: AppPresentation;
  active: boolean;
  variant?: AppFallbackVariant;
}) => {
  const artwork = useImageSequence(presentation.artwork, active);
  return (
    <>
      <AppFallback title={presentation.title} hidden={artwork.loaded} variant={variant} />
      {artwork.src ? (
        <img
          key={artwork.src}
          class={styles.image}
          data-app-artwork
          alt=""
          src={artwork.src}
          hidden={!artwork.loaded}
          style={{ display: artwork.loaded ? undefined : "none" }}
          onLoad={artwork.onLoad}
          onError={artwork.onError}
        />
      ) : null}
    </>
  );
};
