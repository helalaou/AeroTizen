import { useLayoutEffect, useState } from 'preact/hooks';
import { useStore } from '../shared/hooks/useStore';
import type { Clock, SettingsStore } from '../settings/types';

// Reuse upstream formatting and the already rendered weather. No forecast client,
// storage reader or timer is introduced by the optional clock presentation.
export const CustomClock = ({ settings: store, clock }: { settings: SettingsStore; clock: Clock }) => {
  const settings = useStore(store);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState({ icon: '', text: '', city: '', condition: '', hidden: true });
  useLayoutEffect(() => {
    const read = () => {
      setNow(new Date());
      const host = document.getElementById('weather');
      const reading = (window.Weather as typeof window.Weather & { currentReading?(): { code: number } | null }).currentReading?.();
      const code = reading?.code;
      const condition = code === 0 ? 'Clear' : code === 1 ? 'Mainly clear' : code === 2 ? 'Partly cloudy' : code === 3 ? 'Cloudy' : code === 45 || code === 48 ? 'Fog' : code !== undefined && code >= 51 && code <= 57 ? 'Drizzle' : code !== undefined && code >= 61 && code <= 67 ? 'Rain' : code !== undefined && (code >= 71 && code <= 77 || code === 85 || code === 86) ? 'Snow' : code !== undefined && code >= 80 && code <= 82 ? 'Showers' : code !== undefined && code >= 95 ? 'Thunderstorm' : '';
      const next = { condition: window.AeroTizen.i18n?.t(condition || 'Weather unavailable') || condition || 'Weather unavailable', city: host?.querySelector('span')?.textContent || '', icon: host?.querySelector('svg')?.outerHTML || '', text: host?.querySelector('b')?.textContent || '', hidden: !host || Boolean(host.hidden) };
      setWeather(before => before.icon === next.icon && before.text === next.text && before.hidden === next.hidden && before.city === next.city && before.condition === next.condition ? before : next);
    };
    const unsubscribe = clock.subscribe(read), host = document.getElementById('weather');
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(read) : null;
    if (host) { observer?.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); }
    read();
    return () => { unsubscribe(); observer?.disconnect(); };
  }, [clock]);
  useLayoutEffect(() => {
    document.body.classList.toggle('s90c-clock-classic', settings.clockLayout !== 'custom');
    return () => document.body.classList.remove('s90c-clock-classic');
  }, [settings.clockLayout]);
  const text = clock.formatTime(now, settings.timeFormat), date = clock.formatDate(now, settings.dateFormat);
  const fields = clock.formatTimeParts?.(now, settings.timeFormat);
  const parts = /^([^:：.]+)[:：.]([^\s]+)(.*)$/.exec(text);
  const hour = fields ? fields.hour : parts ? parts[1] : text;
  const minute = fields ? fields.minute : parts ? parts[2] : '';
  const period = fields ? fields.dayPeriod ? ' ' + fields.dayPeriod : '' : parts?.[3];
  return <div id="aero-v991-widget" class={settings.aeroClockStyle === 'vertical' ? '' : 'style-' + settings.aeroClockStyle}
    hidden={settings.clockLayout !== 'custom' || !settings.showTime && settings.dateFormat === 'none' && !settings.showWeather}>
    <div class="aero-v991-digits" aria-label={text} hidden={!settings.showTime}>
      <span id="aero-v991-hours" class="aero-v991-digit">{hour}</span>
      <span id="aero-v991-minutes" class="aero-v991-digit">{minute}<small style={{ fontSize: '.2em', letterSpacing: 0 }}>{period}</small></span>
    </div>
    <div id="aero-v991-date" class="aero-v991-date" hidden={settings.dateFormat === 'none'}>{date}</div>
    <div class="aero-v991-weather" hidden={!settings.showWeather}>
      <span class="aero-v991-weather-icon" dangerouslySetInnerHTML={{ __html: weather.icon }} />
      <span id="aero-v991-temp" class="aero-v991-temp">{weather.hidden ? '--°' : weather.text}</span><span id="aero-v991-condition" class="aero-v991-condition">{weather.condition}</span>
    </div>
    <div id="aero-v991-city" class="aero-v991-city" hidden={!settings.showWeather || !settings.weatherShowLocation || weather.hidden}>{weather.city}</div>
  </div>;
};
