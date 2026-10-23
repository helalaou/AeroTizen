import { h, Fragment } from 'preact';
import { Pill } from './controls.jsx';

export function BackgroundSettings({ settings, actions, config }) {
  const list = window.Backgrounds.list;
  const selected = list.find(background => background.id === settings.background);
  const animated = Boolean(selected && selected.anim);
  const percent = (settings.speed - config.SPEED.MIN) / (config.SPEED.MAX - config.SPEED.MIN) * 100;

  function swatches(isAnimated) {
    return list.filter(background => Boolean(background.anim) === isAnimated).map(background => (
      <div key={background.id} class={'swatch' + (background.id === settings.background ? ' on' : '')}
        data-key={'bg:' + background.id} role="button" aria-pressed={background.id === settings.background}
        style={{ background: window.Backgrounds.preview(background) }}
        onClick={() => actions.setBackground(background.id)}>
        <span>{background.name}</span>
      </div>
    ));
  }

  return (
    <>
      <h3>Animated backgrounds</h3>
      <div id="bg-anim" class="swatches">{swatches(true)}</div>
      <div id="speed-row" class="speed-row" hidden={!animated}>
        {animated ? <>
          <div class="slider" data-key="speed" role="slider" aria-label="Background speed"
            aria-valuemin={config.SPEED.MIN} aria-valuemax={config.SPEED.MAX} aria-valuenow={settings.speed}>
            <span class="slider-label">Speed</span>
            <div class="track">
              <div class="fill" style={{ width: percent + '%' }} />
              <div class="thumb" style={{ left: percent + '%' }} />
            </div>
            <span class="slider-value">{settings.speed}×</span>
            <span class="slider-hint">◀ ▶</span>
          </div>
          <Pill id="preview" onSelect={actions.preview}>▶  Preview</Pill>
        </> : null}
      </div>
      <h3>Still backgrounds</h3>
      <div id="bg-still" class="swatches">{swatches(false)}</div>
    </>
  );
}
