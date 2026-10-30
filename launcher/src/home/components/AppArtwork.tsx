import { useImageSequence } from '../../shared/hooks/useImageSequence';
import { AppLogoIcon } from '../../shared/icons/AppLogoIcon';
import type { InstalledApp, AppPresentation } from '../../settings/types';

export const AppArtwork = ({ app, brand, active }: { app: InstalledApp; brand: AppPresentation; active: boolean }) => {
  const artwork = useImageSequence(brand.artwork, active);
  const icon = useImageSequence(brand.useAppIcon && app.icon ? [app.icon] : [], active);
  return <>
    <div class={'app-fallback' + (!brand.label ? ' logo-only' : '') + (brand.largeLogo ? ' logo-big' : '')} hidden={artwork.loaded}>
      {brand.logoPath ? <AppLogoIcon path={brand.logoPath} colour={brand.logoColour} /> : icon.src ?
        <img key={icon.src} class="logo" alt="" src={icon.src} onLoad={icon.onLoad} onError={icon.onError} /> : null}
      {brand.label || !brand.logoPath ? <div class="name" style={{ color: brand.textColour }}>{brand.label || brand.title}</div> : null}
    </div>
    {artwork.src ? <img key={artwork.src} class="app-artwork" alt="" src={artwork.src} hidden={!artwork.loaded}
      style={{ display: artwork.loaded ? undefined : 'none' }} onLoad={artwork.onLoad} onError={artwork.onError} /> : null}
  </>;
};
