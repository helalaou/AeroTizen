import type { AppPresentation, InstalledApp } from "../../contracts/launcher";
import type { AppFallbackVariant } from "../../shared/components/AppFallback";
import { AppFallback } from "../../shared/components/AppFallback";
import { useImageSequence } from "../../shared/hooks/useImageSequence";

export const AppArtwork = ({
  app,
  brand,
  active,
  variant = "home",
}: {
  app: InstalledApp;
  brand: AppPresentation;
  active: boolean;
  variant?: AppFallbackVariant;
}) => {
  const artwork = useImageSequence(brand.artwork, active);
  return (
    <>
      <AppFallback app={app} brand={brand} active={active} hidden={artwork.loaded} variant={variant} />
      {artwork.src ? (
        <img
          key={artwork.src}
          class="app-artwork"
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
