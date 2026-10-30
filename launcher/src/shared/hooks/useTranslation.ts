import { useStore } from './useStore';
const locale = {
  getSnapshot: () => window.AeroTizen.i18n?.locale?.() || 'en',
  subscribe: (listener: () => void) => window.AeroTizen.i18n?.subscribe?.(listener) || (() => {})
};
export const useLocale = () => useStore(locale);
export const useTranslation = () => {
  useLocale();
  return (value: string, key = '') => {
    const translations = window.AeroTizen.i18n;
    // Exact app/input/location values are data, not translation keys.
    if (/^(app:|continue:app:|weather:result:|name:)/.test(key)) { return value; }
    return translations?.label?.(key, value) || translations?.t(value) || value;
  };
};
