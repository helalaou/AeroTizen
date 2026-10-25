import { useContext } from 'preact/hooks';
import { SettingsContext } from '../context';

export const useSettingsEnvironment = () => {
  const environment = useContext(SettingsContext);
  if (!environment) { throw new Error('Settings requires a SettingsProvider.'); }
  return environment;
};
