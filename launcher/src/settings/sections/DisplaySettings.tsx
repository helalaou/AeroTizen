import { Choice } from '../components/Choice';
import { Pill } from '../components/Pill';
import type { Clock, SettingsSectionProps } from '../types';

interface Props extends SettingsSectionProps { clock: Omit<Clock, 'tick'>; openedAt: number }

export const DisplaySettings = ({ settings, actions, clock, openedAt }: Props) => {
  const now = new Date(openedAt);
  const dateStyle = clock.dateStyle(settings.dateFormat);
  return (
    <>
      <h3>Date &amp; time</h3>
      <div id="time-formats" class="units">
        {(['12', '24'] as const).map(format => (
          <Pill key={format} id={'time:' + format} selected={settings.showTime !== false && settings.timeFormat === format}
            onSelect={() => actions.setTimeFormat(format)}>
            {clock.formatTime(now, format) + '  (' + format + '-hour)'}
          </Pill>
        ))}
        <Pill id="time:none" selected={settings.showTime === false} onSelect={() => actions.setTimeFormat('none')}>No time</Pill>
      </div>
      <div id="date-formats" class="units">
        {clock.DATE_FORMATS.map(format => (
          <Pill key={format.id} id={'date:' + format.id} selected={dateStyle === format.id}
            onSelect={() => actions.setDateFormat(format.id)}>{format.id === 'none' ? 'No date' : format.format(now)}</Pill>
        ))}
      </div>
      <h3>Network indicator</h3>
      <Choice id="network-visibility" label="Network indicator visibility" value={settings.showNetwork !== false}
        options={[[true, 'Show'], [false, 'Hide']]} onSelect={actions.setNetworkVisible} />
      <h3>Live TV</h3>
      <p class="hint">Show the Live TV tile in Inputs.</p>
      <Choice id="live-tv-visibility" label="Live TV visibility" value={settings.showLiveTv}
        options={[[true, 'Show'], [false, 'Hide']]} onSelect={actions.setLiveTvVisible} />
      <h3>App cards</h3>
      <Choice id="card-sizes" label="App card size" value={settings.cardSize || 'big'}
        options={[['big', 'Big'], ['small', 'Small']]} onSelect={actions.setCardSize} />
    </>
  );
};
