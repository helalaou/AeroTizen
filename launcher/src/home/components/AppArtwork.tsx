import type { AppPresentation, InstalledApp } from "../../contracts/launcher";
import { AppFallback } from "../../shared/components/AppFallback";
import { useImageSequence } from "../../shared/hooks/useImageSequence";

export const AppArtwork = ({ app, brand, active }: { app: InstalledApp; brand: AppPresentation; active: boolean }) => {
  const artwork = useImageSequence(brand.artwork, active);
  return (
    <>
      <AppFallback app={app} brand={brand} active={active} hidden={artwork.loaded} />
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
