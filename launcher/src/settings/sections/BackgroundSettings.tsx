import { useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import { Choice } from '../components/Choice';
import { Pill } from '../components/Pill';
import { RemoteControl } from '../components/RemoteControl';
import { useStore } from '../../shared/hooks/useStore';
import { useSettingsEnvironment } from '../hooks/useSettingsEnvironment';
import type { BackgroundOption, LauncherConfig, SettingsSectionProps } from '../types';

interface Props extends SettingsSectionProps { config: LauncherConfig; backgrounds: readonly BackgroundOption[] }

export const BackgroundSettings = ({ settings, actions, config, backgrounds: list }: Props) => {
  const selected = list.find(background => background.id === settings.background);
  const animated = Boolean(selected && selected.anim);
  const percent = (settings.speed - config.SPEED.MIN) / (config.SPEED.MAX - config.SPEED.MIN) * 100;
  const { view, navigation } = useSettingsEnvironment();
  const { adjusting } = useStore(view);
  const [filter, setFilter] = useState(settings.weatherPhoto ? 'photo' : animated ? 'animated' : settings.background === 'black' ? 'solid' : 'gradient');
  const show = (category: string) => filter === category;
  // OK toggles adjusting, so Left/Right can still reach Preview from the slider.
  const toggleAdjusting = () => flushSync(() => view.set({ ...view.getSnapshot(), adjusting: !view.getSnapshot().adjusting }));

  const swatches = (isAnimated: boolean) => {
    return list.filter(background => Boolean(background.anim) === isAnimated).map(background => (
      <RemoteControl key={background.id} class={'swatch' + (background.id === settings.background ? ' on' : '')}
        hidden={!isAnimated && (filter === 'solid' ? background.id !== 'black' : background.id === 'black')}
        focusKey={'bg:' + background.id} role="button" aria-pressed={background.id === settings.background}
        style={{ background: background.preview }}
        onClick={() => actions.setBackground(background.id)}>
        <span>{background.name}</span>
      </RemoteControl>
    ));
  };

  return (
    <>
      {<Choice id="wallpaper-categories" label="Background type" value={filter}
        options={[['photo', 'Weather photos'], ['solid', 'Solid colour'], ['gradient', 'Gradients'], ['animated', 'Animated backgrounds']]}
        onSelect={category => { flushSync(() => setFilter(category)); navigation.invalidate(); }} />}
      <div hidden={!show('photo')}>
      <h3>Dynamic weather wallpapers</h3>
      <Choice id="weather-photo-choice" value={settings.weatherPhoto} label="Dynamic weather wallpapers"
        options={[[false, 'Off'], [true, 'Automatic (weather)']]} onSelect={actions.setWeatherPhoto} />
      <p class="hint">Nine AI-generated scenes follow the weather and time of day. Off restores your selected background.</p>
      </div>
      <div hidden={!show('animated')}>
      <h3>Animated backgrounds</h3>
      <div id="bg-anim" class="swatches">{swatches(true)}</div>
      <div id="speed-row" class="speed-row" hidden={!animated}>
        {animated ? <>
          <RemoteControl class={'slider' + (adjusting ? ' adjusting' : '')} focusKey="speed" role="slider"
            aria-label="Background speed" aria-valuemin={config.SPEED.MIN} aria-valuemax={config.SPEED.MAX}
            aria-valuenow={settings.speed} onClick={toggleAdjusting}>
            <span class="slider-label">Speed</span>
            <div class="track">
              <div class="fill" style={{ width: percent + '%' }} />
              <div class="thumb" style={{ left: percent + '%' }} />
            </div>
            <span class="slider-value">{settings.speed}×</span>
            <span class="slider-hint">{adjusting ? '◀ ▶' : 'OK to adjust'}</span>
          </RemoteControl>
          <Pill id="preview" onSelect={actions.preview}>▶  Preview</Pill>
        </> : null}
      </div>
      </div>
      <div hidden={filter !== 'solid' && filter !== 'gradient'}>
      <h3>Still backgrounds</h3>
      <div id="bg-still" class="swatches">{swatches(false)}</div>
      </div>
    </>
  );
};
