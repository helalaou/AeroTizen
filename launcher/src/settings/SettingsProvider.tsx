import type { ComponentChildren } from 'preact';
import { useStore } from '../shared/hooks/useStore';
import { FocusedControlContext, SettingsContext } from './context';
import type { SettingsEnvironment } from './types';

export const SettingsProvider = ({ environment, children }: { environment: SettingsEnvironment; children: ComponentChildren }) => {
  const focusedKey = useStore(environment.navigation);
  return (
    <SettingsContext.Provider value={environment}>
      <FocusedControlContext.Provider value={focusedKey}>{children}</FocusedControlContext.Provider>
    </SettingsContext.Provider>
  );
};
