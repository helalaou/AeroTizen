import type { ComponentChildren } from 'preact';
import { SettingsContext } from './context';
import type { SettingsEnvironment } from './types';

export const SettingsProvider = ({ environment, children }: { environment: SettingsEnvironment; children: ComponentChildren }) => (
  <SettingsContext.Provider value={environment}>{children}</SettingsContext.Provider>
);
