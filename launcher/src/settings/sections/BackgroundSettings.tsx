import { Pill } from '../components/Pill';
import { RemoteControl } from '../components/RemoteControl';
import type { BackgroundOption, LauncherConfig, SettingsSectionProps } from '../types';

interface Props extends SettingsSectionProps { config: LauncherConfig; backgrounds: readonly BackgroundOption[] }

export const BackgroundSettings = ({ settings, actions, config, backgrounds: list }: Props) => {
  const selected = list.find(background => background.id === settings.background);
  const animated = Boolean(selected && selected.anim);
  const percent = (settings.speed - config.SPEED.MIN) / (config.SPEED.MAX - config.SPEED.MIN) * 100;

  const swatches = (isAnimated: boolean) => {
    return list.filter(background => Boolean(background.anim) === isAnimated).map(background => (
      <RemoteControl key={background.id} class={'swatch' + (background.id === settings.background ? ' on' : '')}
        focusKey={'bg:' + background.id} role="button" aria-pressed={background.id === settings.background}
        style={{ background: background.preview }}
        onClick={() => actions.setBackground(background.id)}>
        <span>{background.name}</span>
      </RemoteControl>
    ));
  };

  return (
    <>
      <h3>Animated backgrounds</h3>
      <div id="bg-anim" class="swatches">{swatches(true)}</div>
      <div id="speed-row" class="speed-row" hidden={!animated}>
        {animated ? <>
          <RemoteControl class="slider" focusKey="speed" role="slider" aria-label="Background speed"
            aria-valuemin={config.SPEED.MIN} aria-valuemax={config.SPEED.MAX} aria-valuenow={settings.speed}>
            <span class="slider-label">Speed</span>
            <div class="track">
              <div class="fill" style={{ width: percent + '%' }} />
              <div class="thumb" style={{ left: percent + '%' }} />
            </div>
            <span class="slider-value">{settings.speed}×</span>
            <span class="slider-hint">◀ ▶</span>
          </RemoteControl>
          <Pill id="preview" onSelect={actions.preview}>▶  Preview</Pill>
        </> : null}
      </div>
      <h3>Still backgrounds</h3>
      <div id="bg-still" class="swatches">{swatches(false)}</div>
    </>
  );
};
