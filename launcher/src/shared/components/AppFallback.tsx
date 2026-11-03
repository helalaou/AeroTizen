import type { AppPresentation, InstalledApp } from "../../contracts/launcher";
import { useImageSequence } from "../hooks/useImageSequence";
import { AppLogoIcon } from "../icons/AppLogoIcon";

export const AppFallback = ({
  app,
  brand,
  active,
  hidden,
}: {
  app: InstalledApp;
  brand: AppPresentation;
  active: boolean;
  hidden: boolean;
}) => {
  const icon = useImageSequence(brand.useAppIcon && app.icon ? [app.icon] : [], active);
  return (
    <div
      class={"app-fallback" + (!brand.label ? " logo-only" : "") + (brand.largeLogo ? " logo-big" : "")}
      hidden={hidden}
    >
      {brand.logoPath ? <AppLogoIcon path={brand.logoPath} colour={brand.logoColour} /> : null}
      {!brand.logoPath && icon.src ? (
        <img key={icon.src} class="logo" alt="" src={icon.src} onLoad={icon.onLoad} onError={icon.onError} />
      ) : null}
      {brand.label || !brand.logoPath ? (
        <div class="name" style={{ color: brand.textColour }}>
          {brand.label || brand.title}
        </div>
      ) : null}
    </div>
  );
};
