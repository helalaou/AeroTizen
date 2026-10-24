import { createContext } from 'preact';
import type { SettingsEnvironment } from './types';

export const SettingsContext = createContext<SettingsEnvironment | null>(null);

export const FocusedControlContext = createContext<string | undefined>(undefined);
