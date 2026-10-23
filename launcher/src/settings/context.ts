import { createContext } from 'preact';
import type { SettingsEnvironment } from './types';

export const SettingsContext = createContext<SettingsEnvironment | null>(null);
