import { useMemo } from 'preact/hooks';
import { useImageSequence } from '../../../shared/hooks/useImageSequence';
import { AppLogoIcon } from '../../../shared/icons/AppLogoIcon';
import { RemoteControl } from '../../components/RemoteControl';
import type { InstalledApp, SettingsServices } from '../../types';

interface Props {
  app: InstalledApp;
  selected: boolean;
  active: boolean;
  focusKey?: string; className?: string; disabled?: boolean;
  onSelect(): void;
  describeApp: SettingsServices['describeApp'];
}

export const AppTile = ({ app, selected, active, onSelect, describeApp, focusKey, className = '', disabled = false }: Props) => {
  const brand = useMemo(() => describeApp(app), [app, describeApp]);
  const artwork = useImageSequence(brand.artwork, active);
  const icons = useMemo(() => brand.useAppIcon && app.icon ? [app.icon] : [], [brand.useAppIcon, app.icon]);
  const icon = useImageSequence(icons, active);
  return (
    <RemoteControl class={'tile app-tile ' + className + (selected ? ' on' : '') + (artwork.loaded ? ' has-artwork' : '')}
      focusKey={focusKey || 'app:' + app.id} role="button" aria-label={brand.title} title={brand.title}
      aria-pressed={selected} aria-disabled={disabled || undefined} onClick={() => { if (!disabled) { onSelect(); } }} style={{ background: artwork.loaded ? 'transparent' : brand.background }}>
      <div class={'app-fallback' + (!brand.label ? ' logo-only' : '') + (brand.largeLogo ? ' logo-big' : '')}
        hidden={artwork.loaded}>
        {brand.logoPath ? <AppLogoIcon path={brand.logoPath} colour={brand.logoColour} /> : icon.src ? <img key={icon.src} class="logo" alt="" src={icon.src}
          onLoad={icon.onLoad} onError={icon.onError} /> : null}
        {brand.label || !brand.logoPath ? <div class="name" style={{ color: brand.textColour }}>{brand.label || brand.title}</div> : null}
      </div>
      {artwork.src ? <img key={artwork.src} class="app-artwork" alt="" src={artwork.src}
        hidden={!artwork.loaded} style={{ display: artwork.loaded ? undefined : 'none' }} onLoad={artwork.onLoad} onError={artwork.onError} /> : null}
    </RemoteControl>
  );
};
